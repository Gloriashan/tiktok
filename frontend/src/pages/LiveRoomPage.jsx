import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Typography, Tag, Result, Input, message, Space, Modal, Divider } from 'antd'
import {
  PlayCircleOutlined, HeartOutlined, ShareAltOutlined,
  DollarOutlined, HeartFilled, ShoppingCartOutlined,
  CloseOutlined, SendOutlined, ClockCircleOutlined, SearchOutlined
} from '@ant-design/icons'
import BidPanel from '../components/BidPanel'
import Countdown from '../components/Countdown'
import { formatDuration, parseEndTime } from '../utils/formatDuration'
import api from '../api'
import socket from '../socket'
import useStore from '../store'

const { Title, Text } = Typography

// ========== 假数据 ==========
const MOCK_COMMENTS = [
  { id: 1, user: '小明', text: '这个真不错！', time: '12:01' },
  { id: 2, user: '小红', text: '多少钱能拿下？', time: '12:02' },
  { id: 3, user: '张三', text: '出价了出价了💪', time: '12:03' },
  { id: 4, user: '李四', text: '好看好看！', time: '12:04' },
  { id: 5, user: '王五', text: '加一手加一手', time: '12:04' },
  { id: 6, user: '赵六', text: '👍👍👍', time: '12:05' },
  { id: 7, user: '观众007', text: '太棒了', time: '12:05' },
  { id: 8, user: '买家小王', text: '我要了！', time: '12:06' }
]

/**
 * LiveRoomPage — 移动端直播间页面（用户端）
 *
 * 层叠架构（z-index 从下到上）：
 *   1: 视频层
 *   2: 商品角标层
 *   3: 评论弹幕层
 *   4: 底部操作栏
 *   5: 小黄车半屏弹层
 *   6: 讲解商品弹窗
 *   7: 出价弹层（BidPanel）
 *   8: 竞拍结束全屏覆盖层
 *
 * WebSocket 预留接口：
 *   onPriceUpdate — 服务端推送最新价格
 *   onBidSuccess  — 出价成功后同步
 *   onAuctionEnd  — 服务端推送竞拍结束
 */
export default function LiveRoomPage() {
  const { merchantId } = useParams()
  const navigate = useNavigate()
  const { isConnected } = useStore()
  const setBidCount = useStore((s) => s.setBidCount)
  const setCurrentPriceStore = useStore((s) => s.setCurrentPrice)
  const setConnected = useStore((s) => s.setConnected)
  const setHighlightedProduct = useStore((s) => s.setHighlightedProduct)
  const userInfo = useStore((s) => s.userInfo)
  const userId = userInfo?.id

  // ========== 数据状态 ==========
  const [merchantName, setMerchantName] = useState('商家')
  const [merchantAvatar, setMerchantAvatar] = useState(null)
  const [products, setProducts] = useState([])
  const [currentHighlighted, setCurrentHighlighted] = useState(null)
  const [auctionStatus, setAuctionStatus] = useState('active')
  const [currentPrice, setCurrentPrice] = useState(0)
  const [myBid, setMyBid] = useState(null)           // 当前用户最高出价金额，null=未出价
  const [bidStatus, setBidStatus] = useState('none')  // none | leading | outbid
  const [bidLoading, setBidLoading] = useState(false)
  const [selectedAuction, setSelectedAuction] = useState(null)
  const [bidUpdateCount, setBidUpdateCount] = useState(0)
  const [bidLeaderboard, setBidLeaderboard] = useState([])
  const [totalBidCount, setTotalBidCount] = useState(0)
  const [participantCount, setParticipantCount] = useState(0)
  const [viewerCount, setViewerCount] = useState(0)

  // ========== Ref（解决 socket 回调闭包陷阱） ==========
  const productsRef = useRef(products)
  const highlightedRef = useRef(currentHighlighted)
  const userIdRef = useRef(userId)
  const myBidRef = useRef(myBid)
  const usernameRef = useRef(userInfo?.username)
  const selectedAuctionRef = useRef(selectedAuction)
  useEffect(() => { productsRef.current = products }, [products])
  useEffect(() => { highlightedRef.current = currentHighlighted }, [currentHighlighted])
  useEffect(() => { userIdRef.current = userId }, [userId])
  useEffect(() => { myBidRef.current = myBid }, [myBid])
  useEffect(() => { usernameRef.current = userInfo?.username }, [userInfo])
  useEffect(() => { selectedAuctionRef.current = selectedAuction }, [selectedAuction])

  // ========== UI 状态 ==========
  const [isLiked, setIsLiked] = useState(false)
  const [comments, setComments] = useState(MOCK_COMMENTS)
  const [commentText, setCommentText] = useState('')
  const [showCart, setShowCart] = useState(false)
  const [showBidPanel, setShowBidPanel] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [resultType, setResultType] = useState(null)  // 'won' | 'lost' 竞拍结果类型
  const [resultOrderId, setResultOrderId] = useState(null)
  const [showHighlightPanel, setShowHighlightPanel] = useState(false)
  const [dismissedHighlight, setDismissedHighlight] = useState(false)
  const [pendingDetailItem, setPendingDetailItem] = useState(null)
  const [remainingTime, setRemainingTime] = useState(null)  // 倒计时剩余毫秒
  const [cornerRemainingSecs, setCornerRemainingSecs] = useState(null)  // 左上角角标倒计时剩余秒数
  const [isFollowed, setIsFollowed] = useState(false)
  const [bidToasts, setBidToasts] = useState([])  // 出价提示列表：{ id, username, amount }
  const [dealToast, setDealToast] = useState(null)  // 成交弹窗：{ username, amount, totalBids }

  // ========== 状态文案（直播间只看竞拍结果，不判断支付状态） ==========
  const getAuctionStatusLabel = (item) => {
    const st = item?.auction_status || item?.status
    if (st === 'active') return '竞拍中'
    if (st === 'pending') return '即将开拍'
    if (st === 'cancelled') return '已取消'
    if (st === 'ended') {
      const total = Number(item?.total_bids || item?.bid_count || 0)
      return total > 0 ? '已成交' : '未成交'
    }
    return '未知状态'
  }

  // 角标时间格式：秒 → MM:SS
  const formatCornerDuration = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // ========== 加载商家数据 ==========
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/merchants/${merchantId}/products?view=live`)
        const list = res.data.list || []
        console.log('[直播间] 加载商品列表:', list.length, '条')
        setProducts(list)
        if (list.length > 0) {
          setCurrentPrice(Number(list[0].current_price || list[0].starting_price))
        }
      } catch (_) {}
    })()
    ;(async () => {
      try {
        const res = await api.get('/merchants')
        const found = (res.data.list || []).find(m => String(m.id) === String(merchantId))
        if (found) {
          setMerchantName(found.username)
          setMerchantAvatar(found.avatar)
        }
      } catch (_) {}
    })()
    // 校验商家是否在直播
    ;(async () => {
      try {
        const res = await api.get(`/merchants/${merchantId}/live-status`)
        if (!res.data?.isLive) {
          message.warning('该商家当前未开播')
          navigate('/home', { replace: true })
        }
      } catch (_) {
        navigate('/home', { replace: true })
      }
    })()
  }, [merchantId])

  // ========== 商家不能进入自己的直播间 ==========
  useEffect(() => {
    if (userInfo?.role === 'merchant' && String(userInfo?.id) === String(merchantId)) {
      message.warning('不能进入自己的直播间')
      navigate('/home')
    }
  }, [merchantId, userInfo])

  // ========== WebSocket 事件监听（只注册一次，不依赖组件状态变量） ==========
  useEffect(() => {
    // 监听新出价 — 全部用函数式更新，不读组件状态变量
    socket.on('bid_update', (data) => {
      console.log('[bid_update fired]', data, 'products count:', productsRef.current?.length)
      console.log('[bid_update] data.auction_id:', data.auction_id, typeof data.auction_id)
      console.log('收到新出价:', data)
      setCurrentPrice(data.current_price) // 更新本地当前价格（影响 BidPanel）
      setCurrentPriceStore(data.current_price) // 更新 store
      setBidCount(data.bid_count)
      setBidUpdateCount(c => c + 1) // 触发 BidPanel 刷新排行榜
      // 如果广播携带排行榜数据，直接更新
      if (data.leaderboard && data.leaderboard.length > 0) {
        setBidLeaderboard(data.leaderboard)
      }
      // 更新出价统计
      if (data.total_bid_count !== undefined) setTotalBidCount(data.total_bid_count)
      if (data.participant_count !== undefined) setParticipantCount(data.participant_count)
      // 判断当前用户是否被超越
      // 只有不是自己出的价，才判断是否被超越
      const isMyBid = data.bidder === usernameRef.current
      if (!isMyBid && myBidRef.current !== null && Number(myBidRef.current) < Number(data.current_price)) {
        setBidStatus('outbid')
        setShowBidPanel(true)  // 自动弹出出价面板
      }
      // 更新商品列表中该商品的当前价格（影响小黄车和左上角角标）
      setProducts(prev => {
        console.log('[setProducts] prev items auction_id samples:', prev.slice(0,3).map(p => ({ auction_id: p.auction_id, type: typeof p.auction_id, name: p.product_name || p.name })))
        return prev.map(p => {
          if (Number(p.auction_id) === Number(data.auction_id)) {
            console.log('[setProducts] 命中商品:', p.product_name || p.name, '当前价:', p.current_price, '->', data.current_price)
            return { ...p, current_price: data.current_price, bid_count: data.bid_count }
          }
          return p
        })
      })
      // 如果讲解中商品是这个，也更新它的价格
      setCurrentHighlighted(prev => {
        if (prev && Number(prev.auction_id) === Number(data.auction_id)) {
          return { ...prev, current_price: data.current_price }
        }
        return prev
      })
      // 如果详情弹窗正在展示这个商品，同步更新价格
      setPendingDetailItem(prev => {
        if (prev && Number(prev.auction_id) === Number(data.auction_id)) {
          return { ...prev, current_price: data.current_price, bid_count: data.bid_count }
        }
        return prev
      })
      // 如果出价弹窗打开的是这个商品，同步更新价格
      if (selectedAuctionRef.current && Number(selectedAuctionRef.current.id) === Number(data.auction_id)) {
        setSelectedAuction(prev => ({
          ...prev,
          current_price: data.current_price,
          ...(data.end_time && { end_time: parseEndTime(data.end_time) || prev?.end_time || null })
        }))
      }

      // 新增出价提示
      const toastId = Date.now()
      const rawName = data.bidder || data.username || ''
      const maskedName = rawName.length > 0
        ? rawName[0] + '*'.repeat(Math.max(rawName.length - 1, 1))
        : '***'
      setBidToasts(prev => [...prev, {
        id: toastId,
        username: maskedName,
        amount: data.current_price
      }])
      setTimeout(() => {
        setBidToasts(prev => prev.filter(t => t.id !== toastId))
      }, 3000)
    })

    // 监听竞拍结束
    socket.on('auction_end', (data) => {
      console.log('竞拍结束:', data)
      setCurrentPrice(data.final_price)
      setAuctionStatus('ended')
      // 判断是否当前用户成交
      if (data.winner_id && Number(data.winner_id) === Number(userIdRef.current)) {
        setResultOrderId(data.order_id)  // 用真实订单ID，不要拼假的
        setShowResult(true)
      }
      // 更新商品列表状态
      setProducts(prev => prev.map(p => {
        if (Number(p.auction_id) === Number(data.auction_id)) {
          return { ...p, auction_status: 'ended', current_price: data.final_price }
        }
        return p
      }))
      // 如果详情弹窗正在展示这个商品，同步更新状态
      setPendingDetailItem(prev => {
        if (prev && Number(prev.auction_id) === Number(data.auction_id)) {
          return { ...prev, auction_status: 'ended', current_price: data.final_price }
        }
        return prev
      })
      // 如果讲解中商品是这个，同步更新状态
      setCurrentHighlighted(prev => {
        if (prev && Number(prev.auction_id) === Number(data.auction_id)) {
          return { ...prev, auction_status: 'ended', current_price: data.final_price }
        }
        return prev
      })
      // 如果出价弹窗打开的是这个商品，标记为 ended
      if (selectedAuctionRef.current && Number(selectedAuctionRef.current.id) === Number(data.auction_id)) {
        setSelectedAuction(prev => ({ ...prev, status: 'ended', current_price: data.final_price }))
      }
      // 自动关闭讲解弹窗
       if (highlightedRef.current && Number(highlightedRef.current.auction_id) === Number(data.auction_id)) {
         setDismissedHighlight(true)
       }

      // 成交弹窗（非拍得者显示，拍得者已有全屏支付弹窗；流拍不显示）
      if (data.winner && Number(data.final_price) > 0 && !(data.winner_id && Number(data.winner_id) === Number(userIdRef.current))) {
        const rawName = data.winner || ''
        const maskedName = rawName.length > 0
          ? rawName[0] + '*'.repeat(Math.max(rawName.length - 1, 1))
          : '***'
        setDealToast({
          username: maskedName,
          amount: data.final_price || data.current_price || data.amount
        })
        setTimeout(() => setDealToast(null), 3000)
      }
    })

    // 监听讲解商品（同步更新 store + 本地 UI 状态，立刻弹出卡片）
    socket.on('highlight', (data) => {
      console.log('讲解商品:', data)
      setHighlightedProduct(data)
      setCurrentHighlighted(data)
      setShowHighlightPanel(true)
      setDismissedHighlight(false)
    })

    // 监听竞拍开始（倒计时同步 + 自动弹出讲解卡片）
    socket.on('auction_start', (data) => {
      console.log('竞拍开始:', data)
      setProducts(prev => prev.map(p =>
        Number(p.auction_id) === Number(data.auction_id)
          ? { ...p, auction_status: 'active', end_time: data.end_time }
          : p
      ))
      // 自动弹出讲解卡片：从 productsRef 中找到刚开始的商品
      const startedProduct = productsRef.current.find(
        p => Number(p.auction_id) === Number(data.auction_id)
      )
      if (startedProduct) {
        const highlightData = {
          auction_id: data.auction_id,
          product_name: data.product_name || startedProduct.product_name || startedProduct.name,
          product_image: data.product_image || startedProduct.product_image || startedProduct.image || null,
          product_description: startedProduct.product_description || startedProduct.description || null,
          starting_price: Number(data.starting_price ?? startedProduct.starting_price ?? 0),
          current_price: Number(data.current_price ?? data.starting_price ?? startedProduct.current_price ?? startedProduct.starting_price ?? 0),
          bid_increment: Number(data.bid_increment ?? startedProduct.bid_increment ?? 0),
          max_price: data.max_price != null ? Number(data.max_price) : (startedProduct.max_price != null ? Number(startedProduct.max_price) : null),
          duration: Number(data.duration ?? startedProduct.duration ?? 0),
          end_time: data.end_time,
          auction_status: 'active'
        }
        setHighlightedProduct(highlightData)
        setCurrentHighlighted(highlightData)
        setShowHighlightPanel(true)
        setDismissedHighlight(false)
      }
      // 如果出价弹窗打开的是这个商品，同步更新为 active
      if (selectedAuctionRef.current && Number(selectedAuctionRef.current.id) === Number(data.auction_id)) {
        setSelectedAuction(prev => ({
          ...prev,
          status: 'active',
          end_time: data.end_time,
          current_price: data.current_price || prev?.current_price
        }))
      }
    })

    // 监听新商品上架（商家创建竞拍后实时推送到直播间）
    socket.on('product_added', (newItem) => {
      setProducts(prev => {
        if (prev.some(p => Number(p.auction_id) === Number(newItem.auction_id))) return prev
        return [...prev, newItem]
      })
    })

    // 监听商品下架（商家下架后实时从列表中移除）
    socket.on('product_unlisted', (data) => {
      setProducts(prev => prev.filter(p => Number(p.auction_id) !== Number(data.auction_id)))
      // 如果当前出价弹窗打开的正是该商品，关闭弹窗
      if (selectedAuctionRef.current && Number(selectedAuctionRef.current.id) === Number(data.auction_id)) {
        setSelectedAuction(null)
        setShowBidPanel(false)
      }
      // 如果当前讲解中的正是该商品，清除讲解
      if (highlightedRef.current && Number(highlightedRef.current.auction_id) === Number(data.auction_id)) {
        setCurrentHighlighted(null)
        setShowHighlightPanel(false)
      }
    })

    // 监听重连恢复（断线重连后自动恢复价格和倒计时）
    socket.on('auction_sync', (data) => {
      console.log('[重连恢复] 收到竞拍状态:', data)
      setProducts(prev => prev.map(p =>
        Number(p.auction_id) === Number(data.auction_id)
          ? {
              ...p,
              current_price: data.current_price,
              end_time: parseEndTime(data.end_time)
            }
          : p
      ))
      setCurrentPrice(prev =>
        selectedAuctionRef.current?.id === data.auction_id ? data.current_price : prev
      )
      // 如果当前弹窗打开的是这个商品，同步更新 end_time 和状态
      if (selectedAuctionRef.current && Number(selectedAuctionRef.current.id) === Number(data.auction_id)) {
        setSelectedAuction(prev => ({
          ...prev,
          current_price: data.current_price,
          end_time: parseEndTime(data.end_time) || prev?.end_time || null,
          status: data.status || prev?.status
        }))
      }
    })

    // 监听商品排序更新
    socket.on('product_order_update', (data) => {
       if (String(data.merchantId) !== String(merchantId)) return
       // 用新排序替换本地 pending 商品
       setProducts(prev => {
         const nonPending = prev.filter(p => p.auction_status !== 'pending')
         const updatedPending = prev
           .filter(p => p.auction_status === 'pending')
           .map(p => {
             const found = data.pending_auctions.find(
               a => Number(a.auction_id) === Number(p.auction_id)
             )
             return found ? { ...p, sort_order: found.sort_order } : p
           })
           .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
         return [...nonPending, ...updatedPending]
       })
     })

    // 监听实时在线人数更新
    socket.on('viewer_count_update', (data) => {
      console.log('[viewer_count_update] 实时在线人数:', data.viewer_count)
      setViewerCount(data.viewer_count || 0)
    })

    // 组件卸载时移除监听
    return () => {
      socket.off('bid_update')
      socket.off('auction_end')
      socket.off('highlight')
      socket.off('auction_start')
      socket.off('auction_sync')
      socket.off('product_order_update')
      socket.off('product_added')
      socket.off('product_unlisted')
      socket.off('viewer_count_update')
    }
  }, [])

  // ========== WebSocket 连接/房间管理（跟随 merchantId 变化） ==========
  useEffect(() => {
    socket.connect()
    socket.emit('join_room', merchantId)
    setConnected(true)

    // 重连后重新加入房间
    const handleReconnect = () => {
      socket.emit('join_room', merchantId)
      console.log('[WS重连] 重新加入房间 room_' + merchantId)
    }
    socket.on('connect', handleReconnect)

    // 监听商家下播
    const handleLiveStatus = ({ merchantId: mid, isLive }) => {
      if (String(mid) === String(merchantId) && !isLive) {
        message.info('商家已下播')
        navigate('/home', { replace: true })
      }
    }
    socket.on('merchant_live_status', handleLiveStatus)

    return () => {
      socket.emit('leave_room', merchantId)
      socket.off('merchant_live_status', handleLiveStatus)
      socket.off('connect', handleReconnect)
      socket.disconnect()
      setConnected(false)
    }
  }, [merchantId])

  // ========== 加载讲解中商品 ==========
  useEffect(() => {
    const fetchHighlighted = async () => {
      try {
        const res = await api.get(`/auctions/highlighted/${merchantId}`)
        if (res.data) {
          console.log('[highlighted loaded]', JSON.stringify(res.data, null, 2))
          console.log('[highlighted loaded] 字段名:', Object.keys(res.data))
          console.log('[highlighted loaded] auction_id:', res.data.auction_id, 'id:', res.data.id)
          setCurrentHighlighted(res.data)
          setShowHighlightPanel(true)
          setDismissedHighlight(false)
        } else {
          setCurrentHighlighted(null)
        }
      } catch (_) {}
    }
    fetchHighlighted()
    const interval = setInterval(fetchHighlighted, 10000)
    return () => clearInterval(interval)
  }, [merchantId])

  // ========== 5秒后自动关闭结束覆盖层 ==========
  useEffect(() => {
    if (!showResult) return
    const timer = setTimeout(() => {
      setShowResult(false)
      resetRoom()
    }, 5000)
    return () => clearTimeout(timer)
  }, [showResult])

  // ========== 模拟评论滚动 ==========
  useEffect(() => {
    const interval = setInterval(() => {
      const nicknames = ['路人甲', '拍卖达人', '收藏家老王', '小白', '大佬', '小姐姐', '萌新']
      const messages = ['加价了！', '冲冲冲', '好东西', '666', '真漂亮', '值了', '拼了']
      setComments(prev => [...prev.slice(-15), {
        id: Date.now() + Math.random(),
        user: nicknames[Math.floor(Math.random() * nicknames.length)],
        text: messages[Math.floor(Math.random() * messages.length)],
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }])
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // ===============================================================
  // ========== 核心：根据 myBid 和 currentPrice 自动计算出价状态 ==========
  // ===============================================================
  // 规则：
  //   myBid === null / undefined → 未出价（none）
  //   myBid >= currentPrice      → 我是最高价（leading）
  //   myBid < currentPrice       → 被超越（outbid）
  // ===============================================================
  useEffect(() => {
    if (myBid === null || myBid === undefined) {
      setBidStatus('none')
      console.log('[出价状态] 未出价 (myBid=', myBid, ', currentPrice=', currentPrice, ')')
    } else if (Number(myBid) >= Number(currentPrice)) {
      setBidStatus('leading')
      console.log('[出价状态] 我是最高价 (myBid=', myBid, ', currentPrice=', currentPrice, ')')
    } else {
      setBidStatus('outbid')
      console.log('[出价状态] 被超越 (myBid=', myBid, ', currentPrice=', currentPrice, ')')
    }
  }, [myBid, currentPrice])

  // ===============================================================
  // ========== 获取竞拍详情（含当前价格、我的出价、出价总数） ==========
  // ===============================================================
  const fetchAuctionDetail = useCallback(async (auctionId) => {
    try {
      console.log('[出价] GET /api/auctions/' + auctionId + ' 获取竞拍详情')
      const res = await api.get(`/auctions/${auctionId}`)
      const data = res.data
      console.log('[出价] 竞拍详情返回:', JSON.stringify(data, null, 2))
      console.log('[出价]   current_price:', data.current_price)
      console.log('[出价]   my_bid:', data.my_bid)
      console.log('[出价]   total_bids:', data.total_bids)
      console.log('[出价]   status:', data.status)

      // 更新当前价格
      setCurrentPrice(Number(data.current_price))
      // 更新我的出价（后端返回 my_bid 为数字，null 表示未出价）
      setMyBid(data.my_bid ? Number(data.my_bid) : null)
      // 更新选中竞拍详情
      setSelectedAuction(prev => ({
        ...prev,
        id: Number(auctionId),
        current_price: Number(data.current_price),
        starting_price: Number(data.starting_price),
        bid_increment: Number(data.bid_increment),
        max_price: data.max_price != null ? Number(data.max_price) : null,
        duration: Number(data.duration || prev?.duration || 0),
        end_time: parseEndTime(data.end_time) || prev?.end_time || null,
        status: data.status,
        product_image: data.product_image || prev?.product_image || null,
        snapshot_product_image: data.snapshot_product_image || prev?.snapshot_product_image || null
      }))
      // 更新竞拍状态
      setAuctionStatus(data.status)
    } catch (err) {
      console.error('[出价] 获取竞拍详情失败:', err)
    }
  }, [])

  // ========== 竞拍倒计时（active 状态下每秒更新） ==========
  useEffect(() => {
    if (selectedAuction?.status !== 'active' || !selectedAuction?.end_time) return

    const update = () => {
      const remaining = Math.max(0, Number(selectedAuction.end_time) - Date.now())
      setRemainingTime(remaining)
    }

    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [selectedAuction?.id, selectedAuction?.status, selectedAuction?.end_time])

  // ===============================================================
  // ========== 点击商品 ==========
  // 竞拍中 → 出价弹层
  // 待竞拍 → 展示商品详情（不可出价）
  // 已结束 → 显示成交价+商品简介
  // ===============================================================
  const handleProductClick = (item) => {
    const status = item.auction_status || item.status
    console.log('[出价] 点击商品:', item.product_name || item.name, 'auction_id:', item.auction_id || item.id, 'status:', status)

    // 已结束商品：显示成交价+商品简介
    if (status === 'ended' || status === 'cancelled') {
      const desc = item.description || '暂无介绍'
      const hasBids = (item.total_bids || item.bid_count || 0) > 0
      const finalPrice = hasBids
        ? `成交价 ¥${Number(item.current_price || item.starting_price || 0).toFixed(2)}`
        : '无人出价，流拍'
      message.info({
        content: (
          <div>
            <div><strong>{item.product_name || item.name}</strong></div>
            <div style={{ color: hasBids ? '#e84343' : '#999', fontSize: 16, fontWeight: 700, margin: '4px 0' }}>
              {finalPrice}
            </div>
            <div style={{ color: '#999', fontSize: 12 }}>{desc}</div>
          </div>
        ),
        duration: 4,
        style: { marginTop: '20vh' }
      })
      return
    }

    // 待竞拍商品：展示详情弹窗（不可出价）
    if (status === 'pending') {
      setPendingDetailItem(item)
      setShowCart(false)
      return
    }

    // 竞拍中商品：进入出价弹层（原逻辑）
    // 先设置基本信息，再异步获取详情
    setSelectedAuction({
      id: item.auction_id || item.id,
      name: item.product_name || item.name,
      starting_price: Number(item.starting_price || 0),
      bid_increment: Number(item.bid_increment || 10),
      max_price: item.max_price != null ? Number(item.max_price) : null,
      current_price: Number(item.current_price || item.starting_price || 0),
      duration: Number(item.duration || 0),
      end_time: parseEndTime(item.end_time),
      status: status,
      product_image: item.product_image || item.image || null,
      snapshot_product_image: item.snapshot_product_image || null
    })
    setMyBid(null)
    setBidStatus('none')
    setShowCart(false)
    setShowBidPanel(true)

    // 异步获取服务器实时数据（含我的出价、当前最高价）
    fetchAuctionDetail(item.auction_id || item.id)
  }

  // ===============================================================
  // ========== 提交出价 ==========
  // ===============================================================
  const handleBid = async (amount) => {
    setBidLoading(true)
    try {
      const bidAmount = Number(amount)
      console.log('[出价] 提交出价: auction_id=' + selectedAuction.id + ', bid_amount=' + bidAmount)
      const res = await api.post(`/auctions/${selectedAuction.id}/bid`, { bid_amount: bidAmount })
      console.log('[出价] 出价结果:', JSON.stringify(res))

      message.success(res.message || '出价成功')

      // 刷新竞拍详情（获取最新 current_price 和 my_bid）
      await fetchAuctionDetail(selectedAuction.id)

      // 关闭出价弹层
      setShowBidPanel(false)

      // WebSocket 预留：出价成功后通知外部
      handleBidSuccess(bidAmount)

      // 如果达到封顶价 → 显示竞拍结束覆盖层
      if (res.data?.order_created) {
        console.log('[出价] 触顶成交，显示结束覆盖层')
        console.log('[出价] 返回数据:', JSON.stringify(res.data))
        setAuctionStatus('ended')
        setResultType('won')
        const realOrderId = res.data?.order_id
        setResultOrderId(realOrderId ? String(realOrderId) : `ORD${Date.now()}`)
        console.log('[出价] 支付跳转时使用的 orderId:', realOrderId || `ORD${Date.now()}`)
        setShowResult(true)
      }
    } catch (err) {
      console.error('[出价] 出价失败:', err)
      console.error('[出价] 错误详情:', err.message)
      message.error(err.message || '出价失败')
    } finally {
      setBidLoading(false)
    }
  }

  /** 【WebSocket 预留】出价成功后同步 */
  const handleBidSuccess = (amount) => {
    console.log('[WebSocket预留] 出价成功，金额:', amount)
  }

  // ========== 排序商品（小黄车） ==========
  const sortedProducts = [...products].sort((a, b) => {
    const statusOrder = { active: 0, pending: 1, ended: 2, cancelled: 2 }
    const sa = statusOrder[a.auction_status || a.status] ?? 99
    const sb = statusOrder[b.auction_status || b.status] ?? 99
    if (sa !== sb) return sa - sb
    if (sa === 2) return new Date(b.end_time || 0) - new Date(a.end_time || 0)
    return 0
  })

  const currentProduct = currentHighlighted || products[0]

  // ========== 左上角角标倒计时（active 状态每秒更新） ==========
  useEffect(() => {
    const product = currentProduct || currentHighlighted
    if (!product) {
      setCornerRemainingSecs(null)
      return
    }
    const st = product.auction_status || product.status
    if (st !== 'active') {
      setCornerRemainingSecs(null)
      return
    }

    // 优先用 end_time，回退用 start_time + duration 推算
    const endTime = product.end_time
      ? Number(product.end_time)
      : product.start_time
        ? new Date(product.start_time).getTime() + Number(product.duration) * 1000
        : null
    if (endTime == null) {
      setCornerRemainingSecs(null)
      return
    }

    const update = () => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000))
      setCornerRemainingSecs(remaining)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [currentProduct, currentHighlighted])

  const toggleCart = () => setShowCart(v => !v)
  const toggleLike = () => setIsLiked(v => !v)

  // ========== 发送评论 ==========
  const sendComment = () => {
    if (!commentText.trim()) return
    setComments(prev => [...prev, {
      id: Date.now(),
      user: '我',
      text: commentText.trim(),
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }])
    setCommentText('')
  }

  function resetRoom() {
    setAuctionStatus('active')
    setBidStatus('none')
    setMyBid(null)
    setSelectedAuction(null)
  }

  // ===============================================================
  // ========== 渲染 ==========
  // ===============================================================
  return (
    <div style={{
      width: 375, maxWidth: '100vw', height: '100vh', maxHeight: 812,
      margin: '0 auto', position: 'relative', overflow: 'hidden',
      background: '#000000', color: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* ============================================== */}
      {/* z-index 1: 视频层 */}
      {/* ============================================== */}
      <video
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: 'absolute', inset: 0, zIndex: 1,
          width: '100%', height: '100%', objectFit: 'cover'
        }}
      >
        <source src="/珠宝拍卖.mp4" type="video/mp4" />
      </video>

      {/* ========== 商家信息条（左上角） ========== */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'transparent'
      }}>
        {/* 商家头像（优先显示上传的头像，否则显示首字母圆） */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#FFFFFF', fontSize: 16, flexShrink: 0,
          overflow: 'hidden'
        }}>
          {merchantAvatar ? (
            <img 
              src={`http://localhost:3000${merchantAvatar}`} 
              alt="avatar" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
          ) : (
            merchantName ? merchantName[0] : '商'
          )}
        </div>
        {/* 商家名称 */}
        <span style={{
          color: '#FFFFFF', fontSize: 14,
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
          maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>{merchantName || '商家'}</span>
        {/* 关注按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); setIsFollowed(v => !v) }}
          style={{
            background: isFollowed ? 'rgba(255,255,255,0.25)' : '#FF2748',
            color: '#FFFFFF', fontSize: 13, padding: '4px 12px',
            borderRadius: 999, border: 'none', cursor: 'pointer',
            flexShrink: 0, lineHeight: 1.4
          }}
        >
          {isFollowed ? '已关注' : '关注'}
        </button>
      </div>

      {/* ========== 右上角操作区（在线人数 + 关闭按钮） ========== */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 3,
        display: 'flex', alignItems: 'center', gap: 10
      }}>
        {/* 实时在线人数标签 */}
        <div style={{
          background: 'rgba(0,0,0,0.45)', color: '#FFFFFF',
          borderRadius: 999, padding: '2px 10px', fontSize: 12,
          backdropFilter: 'blur(6px)'
        }}>
          {viewerCount || 0} 人在线
        </div>
        {/* 关闭按钮 */}
        <div onClick={() => navigate('/home')} style={{
          background: 'rgba(0,0,0,0.45)', color: '#FFFFFF',
          width: 32, height: 32, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', backdropFilter: 'blur(6px)'
        }}>
          <CloseOutlined />
        </div>
      </div>

      {/* ============================================== */}
      {/* z-index 2: 商品角标层（左上角） */}
      {/* ============================================== */}
      {currentProduct && (
        <div
          onClick={() => handleProductClick(currentProduct)}
          style={{
            position: 'absolute', top: 96, left: 12, zIndex: 2,
            background: 'rgba(0,0,0,0.6)',
            borderRadius: 12, padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
            backdropFilter: 'blur(8px)', cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.15)',
            userSelect: 'none'
          }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8, flexShrink: 0,
            overflow: 'hidden', background: '#f5f5f5'
          }}>
            {currentProduct.image || currentProduct.product_image ? (
              <img src={currentProduct.image || currentProduct.product_image} alt={currentProduct.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none'; e.target.parentNode.style.background = 'linear-gradient(135deg, #667eea, #764ba2)' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 20
              }}>🛍</div>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                color: '#FFFFFF', fontSize: 13, fontWeight: 600,
                maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {currentProduct.name || currentProduct.product_name || '商品'}
              </span>
              {(() => {
                const st = currentProduct.auction_status || currentProduct.status
                const label = getAuctionStatusLabel(currentProduct)
                if (st === 'active') return <span style={{ background: '#FF2748', color: '#fff', fontSize: 10, lineHeight: '16px', padding: '0 6px', borderRadius: 4, display: 'inline-block' }}>{label}</span>
                if (st === 'pending') return <Tag color="processing" style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>{label}</Tag>
                if (st === 'ended') {
                  const totalBids = Number(currentProduct.total_bids || currentProduct.bid_count || 0)
                  return <Tag color={totalBids > 0 ? 'success' : 'error'} style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>{label}</Tag>
                }
                if (st === 'cancelled') return <Tag color="warning" style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>{label}</Tag>
                return <Tag color="default" style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>{label}</Tag>
              })()}
            </div>
            {(() => {
              const st = currentProduct.auction_status || currentProduct.status
              if (st === 'pending') {
                const dur = Number(currentProduct.duration || 0)
                if (dur > 0) {
                  return <div style={{ color: '#FFB800', fontSize: 13, marginTop: 2 }}>共 {formatCornerDuration(dur)}</div>
                }
                return null
              }
              if (st === 'active') {
                const secs = cornerRemainingSecs
                if (secs !== null) {
                  return <div style={{ color: '#FFB800', fontSize: 13, marginTop: 2 }}>剩余 {formatCornerDuration(secs)}</div>
                }
                return null
              }
              return null
            })()}
            <Text style={{ color: '#FF2748', fontSize: 14, fontWeight: 600, marginTop: 1, display: 'block' }}>
              ¥{Number(currentProduct.current_price || currentProduct.starting_price || 0).toFixed(0)}
            </Text>
          </div>
        </div>
      )}

      {/* ============================================== */}
      {/* z-index 3: 评论弹幕层（左下角） */}
      {/* ============================================== */}

      {/* 出价提示（弹幕正上方 - 系统消息） */}
      {bidToasts.length > 0 && (
        <div style={{
          position: 'absolute',
          left: 12,
          bottom: 'calc(80px + 40vh + 8px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          zIndex: 1,
          pointerEvents: 'none',
          background: 'transparent'
        }}>
          {bidToasts.map(toast => (
            <div key={toast.id} style={{
              background: 'rgba(0,0,0,0.45)',
              borderRadius: 999,
              padding: '4px 12px',
              display: 'inline-flex',
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              backdropFilter: 'blur(6px)'
            }}>
              <span style={{ color: '#FFB800', fontSize: 13, fontWeight: 500 }}>
                {toast.username} 出价 ¥{Number(toast.amount).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{
        position: 'absolute', left: 12, bottom: 80, zIndex: 3,
        width: 200, maxHeight: '40vh', overflow: 'hidden',
        pointerEvents: 'none',
        display: 'flex', flexDirection: 'column-reverse',
        background: 'transparent'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {comments.slice(-8).map(c => {
            const isMe = c.user === '我'
            return (
              <div key={c.id} style={{
                background: isMe ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.45)',
                borderRadius: 999, padding: '4px 12px',
                fontSize: 13, animation: 'commentFadeIn 0.4s ease forwards',
                backdropFilter: 'blur(6px)',
                alignSelf: 'flex-start', maxWidth: '100%'
              }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>{c.user}</Text>
                <Text style={{ color: '#FFFFFF', marginLeft: 6, fontSize: 13 }}>{c.text}</Text>
              </div>
            )
          })}
        </div>
      </div>

      {/* ============================================== */}
      {/* z-index 4: 底部操作栏 */}
      {/* ============================================== */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 4,
        background: 'transparent',
        padding: '28px 12px 16px', display: 'flex', alignItems: 'center', gap: 8
      }}>
        <Input placeholder="说点什么..." value={commentText}
          onChange={e => setCommentText(e.target.value)}
          onPressEnter={sendComment}
          suffix={<SendOutlined onClick={sendComment} style={{ color: commentText.trim() ? '#FFFFFF' : 'rgba(255,255,255,0.5)', cursor: 'pointer' }} />}
          style={{
            flex: 1, borderRadius: 999, height: 36, fontSize: 12,
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#FFFFFF'
          }} />
        <Button shape="circle" size="large" icon={<ShoppingCartOutlined />}
          onClick={toggleCart}
          style={{ background: '#FF2748', color: '#FFFFFF', border: 'none', borderRadius: 999, width: 42, height: 42, fontSize: 18 }} />
        <Button shape="circle" size="large"
          icon={isLiked ? <HeartFilled /> : <HeartOutlined />}
          onClick={toggleLike}
          style={{
            background: isLiked ? '#FF2748' : 'rgba(255,255,255,0.15)',
            color: '#FFFFFF', border: 'none', borderRadius: 999, width: 42, height: 42
          }} />
      </div>

      {/* ============================================== */}
      {/* z-index 5: 小黄车半屏弹层 */}
      {/* ============================================== */}
      {showCart && (
        <>
          <div onClick={toggleCart} style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5,
            background: '#FFFFFF', borderTopLeftRadius: 12, borderTopRightRadius: 12,
            animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            maxHeight: '70vh', overflowY: 'auto'
          }}>
            {/* 顶部拖拽条 */}
            <div style={{ width: 36, height: 4, background: '#E8E8E8', borderRadius: 2, margin: '10px auto 0' }} />
            {/* 顶部搜索导航栏 */}
            <div style={{ background: '#FFFFFF', padding: '12px 12px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#F3F3F3', borderRadius: 999, padding: '8px 12px' }}>
                <SearchOutlined style={{ color: '#999', fontSize: 14, flexShrink: 0 }} />
                <span style={{ color: '#999', fontSize: 14, marginLeft: 8 }}>搜商品/序号</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }}>
                <ClockCircleOutlined style={{ color: '#212121', fontSize: 18 }} />
                <span style={{ fontSize: 10, color: '#212121', marginTop: 2 }}>订单</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }}>
                <ShoppingCartOutlined style={{ color: '#212121', fontSize: 18 }} />
                <span style={{ fontSize: 10, color: '#212121', marginTop: 2 }}>购物车</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }}>
                <HeartOutlined style={{ color: '#212121', fontSize: 18 }} />
                <span style={{ fontSize: 10, color: '#212121', marginTop: 2 }}>更多</span>
              </div>
            </div>
            {/* 商品列表 */}
            {sortedProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无商品</div>
            ) : (
              <div style={{ paddingBottom: 20 }}>
                {sortedProducts.map((item, idx) => {
                  const isActive = item.auction_status === 'active'
                  const isPending = item.auction_status === 'pending'
                  const isEnded = item.auction_status === 'ended' || item.auction_status === 'cancelled'
                  const isHighlighted = item.auction_id === currentHighlighted?.id
                  const statusLabel = getAuctionStatusLabel(item)
                  return (
                    <div key={item.auction_id || item.id || idx}
                      onClick={() => { console.log('[小黄车] 点击:', item.product_name || item.name); handleProductClick(item) }}
                      style={{
                        background: '#FFFFFF', borderRadius: 12, margin: '10px 12px', padding: '12px',
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        cursor: 'pointer', opacity: isEnded ? 0.6 : 1
                      }}>
                      {/* 左侧商品图 */}
                      <div style={{
                        width: 80, height: 80, borderRadius: 8, flexShrink: 0, position: 'relative',
                        overflow: 'hidden', background: '#f5f5f5'
                      }}>
                        {/* 左上角"热卖"标签 */}
                        <div style={{
                          position: 'absolute', top: 4, left: 4, zIndex: 2,
                          background: '#FF2748', color: '#FFFFFF',
                          fontSize: 10, padding: '2px 6px', borderRadius: 6
                        }}>
                          热卖
                        </div>
                        {item.image || item.product_image ? (
                          <img src={item.image || item.product_image} alt={item.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e => { e.target.style.display = 'none'; e.target.parentNode.style.background = 'linear-gradient(135deg, #667eea, #764ba2)' }} />
                        ) : (
                          <div style={{
                            width: '100%', height: '100%',
                            background: 'linear-gradient(135deg, #667eea, #764ba2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 24
                          }}>🛍</div>
                        )}
                      </div>
                      {/* 右侧文字区域 */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 80 }}>
                        <div>
                          {/* 主标题 */}
                          <div style={{
                            color: '#212121', fontSize: 14, lineHeight: '20px',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500
                          }}>
                            {item.product_name || item.name}
                          </div>
                          {/* 促销副标题 */}
                          <div style={{ color: '#FF2748', fontSize: 12, marginTop: 2 }}>
                            {isActive ? '正在热拍' : isPending ? '即将开拍' : '已结束'}
                          </div>
                        </div>
                        {/* 底部：价格 + 去抢购按钮 */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline' }}>
                            <span style={{ color: '#FF2748', fontSize: 12 }}>¥</span>
                            <span style={{ color: '#FF2748', fontSize: 16, fontWeight: 700, marginLeft: 1 }}>
                              {Number(item.current_price || item.starting_price || 0).toFixed(0)}
                            </span>
                            <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                              已售 {item.bid_count || 0}
                            </span>
                          </div>
                          <div style={{
                            background: '#FF2748', color: '#FFFFFF',
                            borderRadius: 999, fontSize: 13,
                            padding: '6px 14px',
                            whiteSpace: 'nowrap'
                          }}>
                            去抢购
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ============================================== */}
      {/* z-index 6: 讲解商品弹窗（右下角） */}
      {/* ============================================== */}
      {showHighlightPanel && currentHighlighted && !dismissedHighlight && !showCart && !showBidPanel && (
        <div style={{
          position: 'absolute', bottom: 80, right: 12, zIndex: 6,
          width: 180, background: '#fff', borderRadius: 16, overflow: 'hidden',
          animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
        }}>
          {/* 状态标签（左上角） */}
          <div style={{
            position: 'absolute', top: 0, left: 0, zIndex: 2,
            background: '#FF1E3E', color: '#fff',
            fontSize: 12, padding: '4px 10px',
            borderRadius: '0 0 8px 0',
            fontWeight: 500, lineHeight: 1.4
          }}>
            {(currentHighlighted.auction_status || currentHighlighted.status) === 'active' ? '竞拍中' : '即将开拍'}
          </div>

          {/* 关闭按钮（右上角） */}
          <Button size="small" type="text" icon={<CloseOutlined />}
            onClick={() => setDismissedHighlight(true)}
            style={{ position: 'absolute', top: 4, right: 4, zIndex: 2, color: '#fff', fontSize: 12 }} />

          {/* 商品图片 */}
          <div style={{ width: '100%', height: 160, overflow: 'hidden', background: '#f5f5f5' }}>
            {currentHighlighted.product_image || currentHighlighted.snapshot_product_image ? (
              <img src={currentHighlighted.product_image || currentHighlighted.snapshot_product_image} alt={currentHighlighted.product_name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none'; e.target.parentNode.style.background = 'linear-gradient(135deg, #667eea, #764ba2)' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 32
              }}>🛍</div>
            )}
          </div>

          {/* 价格区域 */}
          <div style={{ padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ color: '#FF1E3E', fontSize: 22, fontWeight: 'bold', lineHeight: 1.2 }}>
              ¥ {Number(currentHighlighted.current_price || currentHighlighted.starting_price || 0).toFixed(0)}
            </div>
            <div style={{ color: '#999', fontSize: 12, lineHeight: 1.5 }}>
              {(currentHighlighted.auction_status || currentHighlighted.status) === 'active' ? '当前最高价' : '起拍价'}
            </div>
          </div>

          {/* 按钮 */}
          <Button type="primary"
            onClick={() => { handleProductClick(currentHighlighted); setDismissedHighlight(true) }}
            style={{
              display: 'block', height: 40, fontSize: 15, fontWeight: 'bold',
              background: '#FF1E3E', border: 'none',
              borderRadius: 24, margin: '0 auto 12px', width: '80%'
            }}>
            {(currentHighlighted.auction_status || currentHighlighted.status) === 'active' ? '立即出价' : '去看看'}
          </Button>
        </div>
      )}

      {/* ============================================== */}
      {/* z-index 7: 出价弹层（含 BidPanel） */}
      {/* ============================================== */}
      {showBidPanel && selectedAuction && (
        <>
          <div onClick={() => setShowBidPanel(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 7, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 7,
            background: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: '20px 20px 36px',
            animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            maxHeight: '68vh', overflowY: 'auto', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)'
          }}>
            <div style={{ width: 40, height: 4, background: '#e8e8e8', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                overflow: 'hidden', background: '#f5f5f5'
              }}>
                {selectedAuction.product_image || selectedAuction.snapshot_product_image ? (
                  <img src={selectedAuction.product_image || selectedAuction.snapshot_product_image} alt={selectedAuction.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { e.target.style.display = 'none'; e.target.parentNode.style.background = 'linear-gradient(135deg, #667eea, #764ba2)' }} />
                ) : (
                  <div style={{
                    width: '100%', height: '100%',
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 22
                  }}>🛍</div>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <Text strong style={{ fontSize: 15 }}>{selectedAuction.name}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  起拍 ¥{selectedAuction.starting_price}
                  {' | '}加价 ¥{selectedAuction.bid_increment}
                  {selectedAuction.max_price != null && Number(selectedAuction.max_price) > 0 ? ` | 封顶 ¥${selectedAuction.max_price}` : ''}
                </Text>
              </div>
            </div>

            {/* 竞拍时长 / 倒计时 */}
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 12,
              fontSize: 12, display: 'flex', justifyContent: 'space-between',
              alignItems: 'center',
              background: selectedAuction.status === 'active'
                ? '#fff7e6' : selectedAuction.status === 'ended' ? '#f5f5f5' : '#f0f5ff'
            }}>
              <Text style={{ fontSize: 12, color: '#666' }}>
                {selectedAuction.status === 'active'
                  ? <><ClockCircleOutlined style={{ marginRight: 4 }} />剩余时间</>
                  : selectedAuction.status === 'ended'
                    ? '竞拍状态'
                    : <><ClockCircleOutlined style={{ marginRight: 4 }} />竞拍时长</>
                }
              </Text>
              <Text strong style={{
                fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
                color: selectedAuction.status === 'active'
                  ? '#fa8c16' : selectedAuction.status === 'ended' ? '#999' : '#667eea'
              }}>
                {(() => {
                  if (selectedAuction.status === 'ended') return '已结束'
                  if (selectedAuction.status === 'active') {
                    if (remainingTime !== null) {
                      const mins = Math.floor(remainingTime / 1000 / 60)
                      const secs = Math.floor((remainingTime / 1000) % 60)
                      return `${mins}:${String(secs).padStart(2, '0')}`
                    }
                    const endTs = Number(selectedAuction.end_time || 0)
                    if (endTs > 0) {
                      const rem = Math.max(0, endTs - Date.now())
                      const mins = Math.floor(rem / 1000 / 60)
                      const secs = Math.floor((rem / 1000) % 60)
                      return `${mins}:${String(secs).padStart(2, '0')}`
                    }
                    return '加载中...'
                  }
                  // pending
                  return formatDuration(selectedAuction.duration)
                })()}
              </Text>
            </div>

            <BidPanel
              status={bidStatus}
              currentPrice={currentPrice}
              myBid={myBid}
              bidIncrement={selectedAuction?.bid_increment}
              maxPrice={selectedAuction?.max_price}
              onBid={handleBid}
              onBidSuccess={handleBidSuccess}
              loading={bidLoading}
              auctionId={selectedAuction?.id}
              currentUserId={userId}
              bidUpdateCount={bidUpdateCount}
              leaderboardData={bidLeaderboard}
              currentUsername={userInfo?.username || ''}
              totalBidCount={totalBidCount}
              participantCount={participantCount}
            />
          </div>
        </>
      )}

      {/* ============================================== */}
      {/* z-index 8: 竞拍结束全屏覆盖层（仅拍得者显示） */}
      {/* ============================================== */}
      {showResult && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 8,
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.5s ease'
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 36, marginBottom: 16
          }}>🛍</div>
          <Title level={3} style={{ color: '#52c41a', margin: 0 }}>🎉 恭喜拍得！</Title>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 20, margin: '12px 0' }}>
            ¥{currentPrice.toFixed(2)}
          </Text>
          <Space style={{ marginTop: 20 }}>
            <Button type="primary" onClick={() => { console.log('[支付跳转] orderId:', resultOrderId); setShowResult(false); navigate(`/pay/${resultOrderId}`) }}
              style={{ borderRadius: 20, height: 40, padding: '0 28px' }}>确认支付</Button>
            <Button onClick={() => { setShowResult(false); resetRoom() }}
              style={{ borderRadius: 20, height: 40, padding: '0 28px' }}>返回直播间</Button>
          </Space>
        </div>
      )}

      {/* ========== 待竞拍商品详情弹窗 ========== */}
      <Modal
        title={pendingDetailItem?.product_name || pendingDetailItem?.name || '商品详情'}
        open={!!pendingDetailItem}
        onCancel={() => setPendingDetailItem(null)}
        footer={<Button type="primary" onClick={() => setPendingDetailItem(null)}>知道了</Button>}
        width={340}
        centered
      >
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          {/* 商品图片 */}
          <div style={{
            width: 80, height: 80, borderRadius: 16, margin: '0 auto 12px',
            overflow: 'hidden', background: '#f5f5f5'
          }}>
            {pendingDetailItem?.image || pendingDetailItem?.product_image ? (
              <img src={pendingDetailItem.image || pendingDetailItem.product_image}
                alt={pendingDetailItem.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none'; e.target.parentNode.style.background = 'linear-gradient(135deg, #667eea, #764ba2)' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 36
              }}>🛍</div>
            )}
          </div>
          <Title level={5} style={{ margin: 0 }}>
            {pendingDetailItem?.product_name || pendingDetailItem?.name}
          </Title>
          <Text type="secondary" style={{ display: 'block', margin: '8px 0', fontSize: 13 }}>
            {pendingDetailItem?.description || '暂无介绍'}
          </Text>
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '8px 0' }}>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>起拍价</Text>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#333' }}>
                ¥{Number(pendingDetailItem?.starting_price || 0).toFixed(0)}
              </div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>加价幅度</Text>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#333' }}>
                ¥{Number(pendingDetailItem?.bid_increment || 0).toFixed(0)}
              </div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>封顶价</Text>
              <div style={{ fontWeight: 700, fontSize: 15, color: pendingDetailItem?.max_price ? '#333' : '#bfbfbf' }}>
                {pendingDetailItem?.max_price ? `¥${Number(pendingDetailItem.max_price).toFixed(0)}` : '无'}
              </div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>竞拍时长</Text>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#333' }}>
                {formatDuration(pendingDetailItem?.duration)}
              </div>
            </div>
          </div>
          <Tag color="processing" style={{ marginTop: 12 }}>
            <ClockCircleOutlined /> 即将开拍，敬请期待
          </Tag>
        </div>
      </Modal>

      {/* ========== CSS 动画 ========== */}
      <style>{`
        @keyframes commentFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes outbidPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.04); }
        }
      `}</style>

      {dealToast && (
         <div style={{
           position: 'absolute',
           top: '50%',
           left: '50%',
           transform: 'translate(-50%, -50%)',
           zIndex: 1000,
           background: 'linear-gradient(to right, #FAECE3, #FFFFFF, #E6F2FC)',
           borderRadius: 20,
           padding: '24px 32px',
           display: 'flex',
           flexDirection: 'column',
           alignItems: 'center',
           gap: 8,
           pointerEvents: 'none',
           minWidth: 220,
           boxShadow: '0 4px 24px rgba(0,0,0,0.25)'
         }}>
           <span style={{
             fontSize: 18,
             fontWeight: 'bold',
             color: '#333333',
             letterSpacing: 1
           }}>
             {dealToast.username}
           </span>
           <span style={{
             fontSize: 15,
             color: '#B46E44',
             fontWeight: 500
           }}>
             成功拍下！
           </span>
           <span style={{
             fontSize: 36,
             fontWeight: 'bold',
             color: '#9A3A00',
             letterSpacing: 2
           }}>
             ¥{Number(dealToast.amount).toLocaleString()}
           </span>
           <span style={{
             fontSize: 14,
             color: '#B46E44',
             fontWeight: 500
           }}>
             最终成交价
           </span>
         </div>
       )}
    </div>
  )
}

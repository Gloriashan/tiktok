import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Typography, Tag, Modal, Form, Input, message, Space, Select, Divider, Tooltip, Drawer, Statistic, Pagination, Upload } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, LoadingOutlined, CameraOutlined } from '@ant-design/icons'
import api, { authAPI, uploadAPI } from '../api'
import useStore from '../store'
import socket from '../socket'
import { formatDuration } from '../utils/formatDuration'

const { Text } = Typography
const { TextArea } = Input
const { Countdown } = Statistic

// ========== 状态配置 ==========
const STATUS_CONFIG = {
  active:     { label: '竞拍中',   color: 'success' },
  pending:    { label: '即将开拍', color: 'processing' },
  ended_pending: { label: '待支付', color: 'warning' },
  ended_paid:    { label: '已成交', color: 'success' },
  ended_none: { label: '未成交',   color: 'error' },
  cancelled:  { label: '已取消',   color: 'warning' },
}

// ========== 图片上传组件 ==========
function ImageUpload({ value, onChange }) {
  const [uploading, setUploading] = useState(false)

  const customRequest = async ({ file, onSuccess, onError }) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      onChange(res.url)
      onSuccess(res)
    } catch (err) {
      const msg = err?.message || '上传失败'
      message.error(msg)
      onError(err)
    } finally {
      setUploading(false)
    }
  }

  const uploadButton = (
    <div>
      {uploading ? <LoadingOutlined /> : <PlusOutlined />}
      <div style={{ marginTop: 8 }}>{uploading ? '上传中...' : '上传图片'}</div>
    </div>
  )

  return (
    <Upload
      listType="picture-card"
      showUploadList={false}
      customRequest={customRequest}
      accept="image/jpeg,image/png,image/webp"
    >
      {value ? (
        <img src={value} alt="商品图片" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        uploadButton
      )}
    </Upload>
  )
}

export default function MerchantDashboard() {
  const navigate = useNavigate()
  const userInfo = useStore(s => s.userInfo)
  const logout = useStore(s => s.logout)
  const setUser = useStore(s => s.setUser)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total_revenue: 0, total_orders: 0 })
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addForm] = Form.useForm()
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editForm] = Form.useForm()
  const [editingProduct, setEditingProduct] = useState(null)
  const [adding, setAdding] = useState(false)
  const [ordersModal, setOrdersModal] = useState(null)
  const [allOrders, setAllOrders] = useState([])
  const [orderStatusMap, setOrderStatusMap] = useState({})
  const [draggingItemId, setDraggingItemId] = useState(null)
  const [activeTab, setActiveTab] = useState('live')
  const [bio, setBio] = useState('')
  const [savingBio, setSavingBio] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [currentSessionName, setCurrentSessionName] = useState('')
  const [sessions, setSessions] = useState([])
  const [sessionsTotal, setSessionsTotal] = useState(0)
  const [sessionsPage, setSessionsPage] = useState(1)
  const [expandedSessionId, setExpandedSessionId] = useState(null)
  const [expandedSessionProducts, setExpandedSessionProducts] = useState([])
  const [expandedSessionLoading, setExpandedSessionLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef(null)

  // ========== 数据加载 ==========
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const pres = await api.get(`/merchants/${userInfo.id}/products`)
      const list = pres.data.list || []
      console.log('[fetchData] 所有商品原始数据:', list)
      setProducts(list)
      try {
        const sres = await api.get(`/merchants/${userInfo.id}/stats`)
        setStats(sres.data)
      } catch (_) {}
    } catch (err) {
      message.error(err.message)
    }
    finally { setLoading(false) }
  }, [userInfo.id])

  // 加载订单数据（用于判断 hasOrder）
  useEffect(() => {
    api.get('/orders/merchant').then(res => {
      const list = res.data.list || []
      setAllOrders(list)
      // 每个 auction_id 取最新订单的 payment_status（用于 ended 状态展示：待支付/已成交）
      const map = {}
      list.forEach(o => {
        if (!o.auction_id) return
        const aid = Number(o.auction_id)
        const current = map[aid]
        if (!current || Number(o.id) > Number(current.id)) {
          map[aid] = { id: o.id, payment_status: o.payment_status }
        }
      })
      const statusOnlyMap = {}
      Object.keys(map).forEach(aid => { statusOnlyMap[aid] = map[aid].payment_status })
      setOrderStatusMap(statusOnlyMap)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    (async () => {
      if (!userInfo?.id) return
      setLoading(true)
      try {
        const pres = await api.get(`/merchants/${userInfo.id}/products`)
        const list = pres.data.list || []
        console.log('[fetchData] 所有商品原始数据:', list)
        setProducts(list)
        try {
          const sres = await api.get(`/merchants/${userInfo.id}/stats`)
          setStats(sres.data)
        } catch (_) {}
      } catch (err) {
        message.error(err.message)
      }
      finally { setLoading(false) }
    })()
  }, [userInfo?.id])

  // ========== 加载开播状态 ==========
  useEffect(() => {
    api.get('/merchants/status').then(res => {
      const d = res.data
      setIsLive(d?.isLive || false)
      if (d?.currentSession) {
        setCurrentSessionId(d.currentSession.id)
        setCurrentSessionName(d.currentSession.name || '')
      } else {
        setCurrentSessionId(null)
        setCurrentSessionName('')
      }
    }).catch(() => {})
  }, [userInfo.id])

  // ========== WebSocket 实时更新 ==========
  useEffect(() => {
    if (!userInfo?.id) return
    socket.connect()
    socket.emit('join_room', userInfo.id)
    socket.emit('join_user_room', userInfo.id)
    socket.emit('join_merchant_room', userInfo.id)

    // 重连后重新加入房间
    const handleReconnect = () => {
      socket.emit('join_room', userInfo.id)
      socket.emit('join_user_room', userInfo.id)
      socket.emit('join_merchant_room', userInfo.id)
    }
    socket.on('connect', handleReconnect)

    socket.on('bid_update', (data) => {
      setProducts(prev => prev.map(p =>
        Number(p.auction_id) === Number(data.auction_id)
          ? { ...p, current_price: data.current_price, total_bids: data.bid_count }
          : p
      ))
    })

    socket.on('auction_end', (data) => {
      console.log('[商家端 auction_end 收到]', data)
      setProducts(prev => prev.map(p => {
        if (Number(p.auction_id) === Number(data.auction_id)) {
          const subStatus = data.winner_id ? 'sold' : 'unsold'
          return {
            ...p,
            auction_status: 'ended',
            sub_status: subStatus,
            current_price: data.final_price,
            winner_id: data.winner_id,
            winner: data.winner
          }
        }
        return p
      }))
    })

    socket.on('order_paid', (data) => {
      console.log('[商家端] 收到支付通知:', data)
      message.success(`🎉 ${data.buyer_username} 已完成支付 ¥${Number(data.final_price).toFixed(2)}`)
      // 重新拉取订单数据，更新 hasOrder 判断
      api.get('/orders/merchant').then(res => {
        const list = res.data.list || []
        setAllOrders(list)
        const map = {}
        list.forEach(o => {
          if (!o.auction_id) return
          const aid = Number(o.auction_id)
          const current = map[aid]
          if (!current || Number(o.id) > Number(current.id)) {
            map[aid] = { id: o.id, payment_status: o.payment_status }
          }
        })
        const statusOnlyMap = {}
        Object.keys(map).forEach(aid => { statusOnlyMap[aid] = map[aid].payment_status })
        setOrderStatusMap(statusOnlyMap)
      }).catch(() => {})
    })

    socket.on('order_cancelled', (data) => {
      console.log('[商家端] 收到订单取消通知:', data)
      // 订单超时取消后，刷新订单映射，让"待支付"状态变为"已取消"
      api.get('/orders/merchant').then(res => {
        const list = res.data.list || []
        setAllOrders(list)
        const map = {}
        list.forEach(o => {
          if (!o.auction_id) return
          const aid = Number(o.auction_id)
          const current = map[aid]
          if (!current || Number(o.id) > Number(current.id)) {
            map[aid] = { id: o.id, payment_status: o.payment_status }
          }
        })
        const statusOnlyMap = {}
        Object.keys(map).forEach(aid => { statusOnlyMap[aid] = map[aid].payment_status })
        setOrderStatusMap(statusOnlyMap)
      }).catch(() => {})
    })

    // 监听物流更新（买家签收后更新商家端订单状态）
    socket.on('order_logistics_update', ({ orderId, logisticsStatus }) => {
      setAllOrders(prev => prev.map(o =>
        Number(o.id) === Number(orderId)
          ? { ...o, logistics_status: logisticsStatus }
          : o
      ))
      // 同步更新订单详情弹窗
      setOrdersModal(prev => {
        if (!prev) return prev
        return {
          ...prev,
          orders: prev.orders.map(o =>
            Number(o.id) === Number(orderId)
              ? { ...o, logistics_status: logisticsStatus }
              : o
          )
        }
      })
    })

    return () => {
      socket.off('connect', handleReconnect)
      socket.off('bid_update')
      socket.off('auction_end')
      socket.off('order_paid')
      socket.off('order_cancelled')
      socket.off('order_logistics_update')
    }
  }, [userInfo?.id])

  // ========== 切换"直播记录"Tab 时加载历史场次 ==========
  useEffect(() => {
    if (activeTab === 'live') loadSessions(1)
  }, [activeTab])

  // 初始加载
  useEffect(() => { loadSessions(1) }, [])

  // ========== 添加商品 ==========
  const handleAdd = async () => {
    try {
      const vals = await addForm.validateFields()
      setAdding(true)
      await api.post('/products', {
        name: vals.name.trim(),
        image: vals.image?.trim() || undefined,
        description: vals.description?.trim() || undefined
      })
      message.success('商品添加成功')
      setAddModalOpen(false)
      addForm.resetFields()
      fetchData()
    } catch (err) {
      if (err.errorFields) return
      message.error(err.message || '添加失败')
    } finally { setAdding(false) }
  }

  // ========== 编辑商品 + 创建竞拍 ==========
  const handleEditProduct = (product) => {
    setEditingProduct(product)
    editForm.setFieldsValue({
      name: product.name,
      image: product.image || '',
      description: product.description || '',
      start_price: '',
      price_step: '',
      max_price: '',
      duration: ''
    })
    setEditModalOpen(true)
  }

  const handleSaveEdit = async () => {
    try {
      const vals = await editForm.validateFields()
      const productId = editingProduct.id

      // 1. 更新商品基础信息
      await api.put(`/products/${productId}`, {
        name: vals.name.trim(),
        image: vals.image?.trim() || undefined,
        description: vals.description?.trim() || undefined
      })

      // 2. 创建竞拍
      if (vals.start_price && vals.price_step && vals.duration) {
        await api.post('/auctions', {
          product_id: productId,
          start_price: Number(vals.start_price),
          price_step: Number(vals.price_step),
          max_price: vals.max_price ? Number(vals.max_price) : null,
          duration: Number(vals.duration)
        })
        message.success('竞拍创建成功，商品已移至直播列表')
      } else {
        message.warning('请填写起拍价、加价幅度和时长')
        return
      }

      setEditModalOpen(false)
      setEditingProduct(null)
      fetchData()
    } catch (err) {
      if (err.errorFields) return
      message.error(err.message || '操作失败')
    }
  }

  // ========== 开始竞拍 ==========
  const startAuction = async (aid) => {
    try {
      await api.post(`/auctions/${aid}/start`)
      message.success('竞拍已开始')
      // 立即更新本地状态，不等接口刷新
      setProducts(prev => prev.map(p =>
        Number(p.auction_id) === Number(aid)
          ? { ...p, auction_status: 'active' }
          : p
      ))
      fetchData()
    } catch (err) { message.error(err.message) }
  }

  // ========== 下架商品 ==========
  const deactivate = async (pid) => {
    Modal.confirm({
      title: '确认下架',
      content: '下架后原商品将转为历史记录（只读保留），同时自动创建一份全新商品草稿供您重新编辑上架。',
      okText: '确认下架',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await api.post(`/products/${pid}/deactivate`)
          message.success('已下架')
          fetchData()
        } catch (err) { message.error(err.message) }
      }
    })
  }

  // ========== 删除商品 ==========
  const deleteProduct = (product) => {
    Modal.confirm({
      title: '确认删除商品？',
      content: '确认删除该商品草稿？此操作不可恢复。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/products/${product.id}`)
          message.success('商品已删除')
          fetchData()
        } catch (err) { message.error(err.message) }
      }
    })
  }

  // ========== 讲解/取消讲解 ==========
  const handleHighlight = async (auctionId, highlighted) => {
    try {
      await api.post(`/auctions/${auctionId}/highlight`, { highlighted })
      message.success(highlighted ? '开始讲解' : '取消讲解')
      fetchData()
    } catch (err) { message.error(err.message) }
  }

  // ========== 查看订单 ==========
  const viewOrders = async (auctionId, productName) => {
    try {
      const relevant = allOrders.filter(o => o.auction_id === auctionId)
      setOrdersModal({ product_name: productName, orders: relevant, auctionId })
    } catch (_) { setOrdersModal({ product_name: productName, orders: [], auctionId }) }
  }

  // ========== 历史场次操作 ==========
  const loadSessions = async (page = 1) => {
    try {
      const res = await api.get(`/merchants/sessions?page=${page}&limit=10`)
      setSessions(res.data.sessions || [])
      setSessionsTotal(res.data.total || 0)
      setSessionsPage(page)
    } catch (_) {}
  }

  const handleEditSessionName = async (sessionId, newName) => {
    try {
      await api.patch(`/merchants/sessions/${sessionId}/name`, { name: newName })
      message.success('名称已更新')
      loadSessions(sessionsPage)
    } catch (err) { message.error(err.message || '更新失败') }
  }

  const handleSessionExpand = async (sessionId) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null)
      setExpandedSessionProducts([])
      return
    }
    setExpandedSessionId(sessionId)
    setExpandedSessionLoading(true)
    try {
      const res = await api.get(`/merchants/sessions/${sessionId}`)
      setExpandedSessionProducts(res.data.list || [])
    } catch (_) { setExpandedSessionProducts([]) }
    finally { setExpandedSessionLoading(false) }
  }

  // ========== 商家发货 ==========
  const handleShip = (orderId) => {
    Modal.confirm({
      title: '确认发货？',
      content: '发货后买家将收到通知，请确认已寄出商品',
      okText: '确认发货',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.post(`/orders/${orderId}/ship`)
          message.success('发货成功！')
          // 立即本地更新状态，无需等待网络刷新
          setAllOrders(prev => prev.map(o =>
            Number(o.id) === Number(orderId)
              ? { ...o, logistics_status: '已发货' }
              : o
          ))
          setOrdersModal(prev => {
            if (!prev) return prev
            return {
              ...prev,
              orders: prev.orders.map(o =>
                Number(o.id) === Number(orderId)
                  ? { ...o, logistics_status: '已发货' }
                  : o
              )
            }
          })
        } catch (err) { message.error(err?.response?.data?.message || err.message || '发货失败') }
      }
    })
  }

  // ========== 开播/下播 ==========
  const handleLiveToggle = async () => {
    if (isLive) {
      Modal.confirm({
        title: '确认下播？',
        content: '下播后用户端将看不到您的直播间',
        okText: '确认下播',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          try {
            await api.post('/merchants/endlive')
            setIsLive(false)
            setCurrentSessionId(null)
            setCurrentSessionName('')
            message.success('已下播')
            loadSessions(1)
          } catch (err) { message.error(err.message || '下播失败') }
        }
      })
    } else {
      let sessionName = ''
      Modal.confirm({
        title: '开始直播',
        icon: null,
        content: (
          <div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>本场名称（可选）</div>
            <input
              id="session-name-input"
              placeholder="请输入直播名称..."
              onChange={(e) => { sessionName = e.target.value }}
              onKeyDown={(e) => { if (e.key === 'Enter') document.querySelector('.ant-btn-primary')?.click() }}
              style={{
                width: '100%', height: 40, borderRadius: 8, border: '1px solid #d9d9d9',
                padding: '0 12px', fontSize: 14, outline: 'none',
                boxSizing: 'border-box'
              }}
              autoFocus
            />
            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>不填将自动命名</div>
          </div>
        ),
        okText: '开始直播',
        cancelText: '取消',
        onOk: async () => {
          try {
            const res = await api.post('/merchants/golive', { name: sessionName || undefined })
            setIsLive(true)
            setCurrentSessionId(res.session_id)
            // 获取场次名称
            const statusRes = await api.get('/merchants/status')
            if (statusRes.data?.currentSession) {
              setCurrentSessionName(statusRes.data.currentSession.name || '')
            }
            message.success('开播成功！')
          } catch (err) { message.error(err.message || '开播失败') }
        }
      })
    }
  }

  const handleLogoutConfirm = () => {
    Modal.confirm({
      title: '确认退出',
      content: '退出后需要重新登录',
      okText: '确认退出',
      cancelText: '取消',
      okType: 'danger',
      onOk: () => { logout(); navigate('/auth', { replace: true }) }
    })
  }

  // ========== 保存个人简介 ==========
  const handleSaveBio = async () => {
    setSavingBio(true)
    try {
      // TODO: 调用后端 PUT /api/auth/profile 接口保存简介
      // await api.put('/auth/profile', { bio })
      message.success('简介已保存')
    } catch (err) {
      message.error(err.message || '保存失败')
    } finally { setSavingBio(false) }
  }

  // ========== 上传头像 ==========
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('图片大小不能超过5MB')
      return
    }

    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const uploadRes = await uploadAPI.uploadImage(formData)
      const avatarUrl = uploadRes.url
      await authAPI.updateAvatar(avatarUrl)
      const res = await authAPI.getMe()
      if (res.data) {
        setUser(res.data)
      }
      message.success('头像上传成功')
    } catch (err) {
      message.error(err.message || '上传失败')
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ========== 待竞拍商品拖拽排序 ==========
  const handleDragStart = (e, auctionId) => {
    e.dataTransfer.setData('text/plain', String(auctionId))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingItemId(auctionId)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e, targetAuctionId) => {
    e.preventDefault()
    const sourceAuctionId = Number(e.dataTransfer.getData('text/plain'))
    setDraggingItemId(null)
    if (sourceAuctionId === targetAuctionId || !sourceAuctionId) return

    // 获取当前待竞拍商品列表
    const pendingItems = liveProducts.filter(p => p.auction_status === 'pending')
    const sourceIdx = pendingItems.findIndex(p => p.auction_id === sourceAuctionId)
    const targetIdx = pendingItems.findIndex(p => p.auction_id === targetAuctionId)
    if (sourceIdx === -1 || targetIdx === -1) return

    // 本地重排（乐观更新）— 同时更新 sort_order
    const reordered = [...pendingItems]
    const [moved] = reordered.splice(sourceIdx, 1)
    reordered.splice(targetIdx, 0, moved)

    // 重新赋值 sort_order
    const updatedItems = reordered.map((item, index) => ({ ...item, sort_order: index + 1 }))
    const newOrder = updatedItems.map(p => p.auction_id)

    // 更新本地 state 让用户立即看到效果
    const pendingIds = new Set(newOrder)
    setProducts(prev => [
      ...prev.filter(p => !pendingIds.has(p.auction_id)),
      ...updatedItems
    ])
    try {
      await api.put('/auctions/reorder', { ids: newOrder })
      message.success('排序已更新')
    } catch (err) {
      message.error(err.message || '排序更新失败')
      fetchData() // 失败时恢复
    }
  }

  // ========== 数据筛选（缓存） ==========
  const liveProducts = useMemo(() => {
    const priority = { active: 0, pending: 1, ended: 2 }
    return products
      .filter(p => {
        if (p.auction_status !== 'pending' &&
            p.auction_status !== 'active' &&
            p.auction_status !== 'ended') return false
        // 开播期间只显示属于当前场次的商品
        if (currentSessionId) return Number(p.session_id) === Number(currentSessionId)
        return true
      })
      .sort((a, b) => {
        const pa = priority[a.auction_status] ?? 99
        const pb = priority[b.auction_status] ?? 99
        const statusDiff = pa - pb
        if (statusDiff !== 0) return statusDiff
        // 同是 pending 时按 sort_order 排序
        if (a.auction_status === 'pending' && b.auction_status === 'pending') {
          return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
        }
        return 0
      })
  }, [products, currentSessionId])

  const draftProducts = useMemo(() => products.filter(p =>
    p.auction_status === null ||
    p.auction_status === undefined ||
    p.auction_status === 'cancelled'
  ), [products])


  // ========== 获取商品状态标签配置 ==========
  const getProductStatus = (p, statusMap) => {
    const aStatus = p.auction_status
    const totalBids = p.total_bids || 0
    const paymentStatus = statusMap[Number(p.auction_id)] || null

    if (aStatus === 'active') return STATUS_CONFIG.active
    if (aStatus === 'pending') return STATUS_CONFIG.pending
    if (aStatus === 'ended') {
      if (totalBids > 0) {
        if (paymentStatus === 'paid') return STATUS_CONFIG.ended_paid
        if (paymentStatus === 'cancelled') return STATUS_CONFIG.cancelled
        return STATUS_CONFIG.ended_pending
      }
      return STATUS_CONFIG.ended_none
    }
    if (aStatus === 'cancelled') return STATUS_CONFIG.cancelled
    return { label: '未知状态', color: 'default' }
  }

  // ========== 商品卡片渲染（复用：本场直播 + 历史场次） ==========
  const renderProductCard = (p, idx) => {
    const isPending = p.auction_status === 'pending'
    const statusCfg = getProductStatus(p, orderStatusMap)
    const isHighlighted = p.highlighted || false
    const aStatus = p.auction_status
    const isActiveOrPending = aStatus === 'active' || aStatus === 'pending'
    const startPrice = p.starting_price ? Number(p.starting_price) : 0
    const bidIncrement = p.bid_increment ? Number(p.bid_increment) : 0
    const maxPrice = p.max_price ? Number(p.max_price) : null
    const currentPrice = p.current_price ? Number(p.current_price) : startPrice
    const totalBids = p.total_bids || 0
    const endTime = p.end_time ? Number(p.end_time) : null
    const isEndedNoBids = aStatus === 'ended' && totalBids === 0
    const showCountdown = aStatus === 'active' && endTime && endTime > Date.now()

    return (
      <div key={p.id}
        draggable={isPending}
        onDragStart={(e) => isPending && handleDragStart(e, p.auction_id)}
        onDragOver={isPending ? handleDragOver : undefined}
        onDrop={(e) => isPending && handleDrop(e, p.auction_id)}
        onDragEnd={() => setDraggingItemId(null)}
        style={{
          cursor: isPending ? 'grab' : 'default',
          opacity: draggingItemId === p.auction_id ? 0.4 : 1,
          transition: 'opacity 0.2s',
          padding: '12px 0'
        }}
      >
        {isPending && (
          <div style={{ fontSize: 11, color: '#999', padding: '0 0 6px 0' }}>
            ⠿ 拖拽调整待竞拍顺序
          </div>
        )}
        {/* 顶部一行：商品名 + 状态标签 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <Text strong ellipsis style={{ fontSize: 14, flex: 1 }}>{p.name || '未命名'}</Text>
            {isHighlighted && <Tag color="green" style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>讲解中</Tag>}
          </div>
          <Tag color={statusCfg.color} style={{ fontSize: 11, margin: 0, flexShrink: 0, marginLeft: 8 }}>
            {statusCfg.label}
          </Tag>
        </div>
        {/* 中间 2x3 网格 */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: '6px 4px', marginBottom: 8
        }}>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>起拍价</Text>
            <Text strong style={{ fontSize: 13 }}>¥{startPrice.toFixed(2)}</Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>加价幅度</Text>
            <Text strong style={{ fontSize: 13 }}>¥{bidIncrement.toFixed(2)}</Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>封顶价</Text>
            <Text strong style={{ fontSize: 13, color: maxPrice ? '#333' : '#bfbfbf' }}>
              {maxPrice ? `¥${maxPrice.toFixed(2)}` : '无'}
            </Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>当前出价</Text>
            <Text strong style={{
              fontSize: 13,
              color: isEndedNoBids ? '#bfbfbf' : '#e84343'
            }}>
              {isEndedNoBids ? '流拍' : `¥${Number(currentPrice).toFixed(2)}`}
            </Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>出价次数</Text>
            <Text strong style={{ fontSize: 13 }}>{totalBids} 次</Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>倒计时</Text>
            {showCountdown ? (
              <Countdown
                value={endTime}
                format="mm:ss"
                valueStyle={{
                  fontSize: 13, color: '#e84343', fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums'
                }}
                onFinish={() => {}}
              />
            ) : aStatus === 'pending' ? (
              <Text strong style={{ fontSize: 13, color: '#667eea' }}>
                共 {formatDuration(p.duration)}
              </Text>
            ) : (
              <Text strong style={{ fontSize: 13, color: '#bfbfbf' }}>--:--</Text>
            )}
          </div>
        </div>
        {/* 底部一行：操作按钮 */}
        <div style={{ display: 'flex', gap: 8 }}>
          {isActiveOrPending && (
            <>
              <Button size="small" danger
                style={{ height: 36, flex: 1, fontSize: 12 }}
                onClick={() => deactivate(p.id)}>
                下架
              </Button>
              <Button size="small"
                type={isHighlighted ? 'primary' : 'default'}
                disabled={!isLive}
                title={!isLive ? '请先开播' : ''}
                style={{
                  height: 36, flex: 1, fontSize: 12,
                  ...(isHighlighted ? { background: '#52c41a', borderColor: '#52c41a' } : {})
                }}
                onClick={() => handleHighlight(p.auction_id, !isHighlighted)}>
                {isHighlighted ? '取消讲解' : '讲解'}
              </Button>
            </>
          )}
          {aStatus === 'pending' && (
            <Button size="small" type="primary"
              style={{ height: 36, flex: 1, fontSize: 12 }}
              disabled={!isLive}
              onClick={() => startAuction(p.auction_id)}>
              开始竞拍
            </Button>
          )}
          <Button size="small"
            style={{ height: 36, flex: 1, fontSize: 12, border: '1px solid #d9d9d9' }}
            onClick={() => viewOrders(p.auction_id, p.name)}>
            订单
          </Button>
        </div>
      </div>
    )
  }

  // ========== 可编辑场次名称 ==========
  const InlineEditName = ({ name, onSave }) => {
    const [editing, setEditing] = useState(false)
    const [val, setVal] = useState(name || '')

    useEffect(() => { setVal(name || '') }, [name])

    if (editing) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Input
            size="small"
            value={val}
            onChange={e => setVal(e.target.value)}
            onPressEnter={() => { onSave(val); setEditing(false) }}
            onBlur={() => { onSave(val); setEditing(false) }}
            style={{ width: 160, height: 28, fontSize: 13 }}
            autoFocus
          />
        </div>
      )
    }

    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 14, fontWeight: 600 }}>{name || '未命名'}</Text>
        <EditOutlined
          style={{ fontSize: 12, color: '#999', cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f5f5f5', paddingBottom: 56 }}>
      {/* ===== 顶部固定导航栏 ===== */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100, height: 56,
        background: '#fff', padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0'
      }}>
        <Text strong style={{ fontSize: 16 }}>{userInfo?.username || '商家'} 后台</Text>
        <Button
          type={isLive ? 'default' : 'primary'}
          danger={isLive}
          icon={isLive ? null : null}
          onClick={handleLiveToggle}
          style={{
            height: 32, borderRadius: 16, fontSize: 12,
            padding: '0 12px', marginLeft: 8
          }}
        >
          {isLive ? '⏹ 下播' : '🔴 开播'}
        </Button>
      </div>

      {/* ===== Tab 内容 ===== */}
      {activeTab === 'live' && (
        <div style={{ padding: '0 16px 80px' }}>
          {/* ===== 区域一：本场直播（仅开播时显示） ===== */}
          {isLive && currentSessionId && (
            <div style={{
              background: '#fff', borderRadius: 12, border: '1px solid #ff4d4f',
              padding: '14px 16px', marginBottom: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#ff4d4f', fontWeight: 600 }}>🔴 本场直播</span>
                <InlineEditName
                    name={currentSessionName}
                    onSave={(newName) => {
                      setCurrentSessionName(newName)
                      api.patch(`/merchants/sessions/${currentSessionId}/name`, { name: newName }).catch(() => {})
                    }}
                  />
              </div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 12 }}>
                开播时间：{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>加载中...</div>
                ) : liveProducts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 13 }}>
                    暂无直播商品
                  </div>
                ) : liveProducts.map((p, idx) => renderProductCard(p, idx))}
              </div>
            </div>
          )}

          {/* ===== 区域二：历史场次列表 ===== */}
          <div>
            <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>
              历史场次 {sessionsTotal > 0 && `(共${sessionsTotal}场)`}
            </Text>

            {sessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999', fontSize: 13 }}>
                暂无历史场次
              </div>
            ) : sessions.map(session => (
              <div key={session.id} style={{
                background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0',
                marginBottom: 12, overflow: 'hidden'
              }}>
                <div
                  onClick={() => handleSessionExpand(session.id)}
                  style={{
                    padding: '14px 16px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                       <InlineEditName
                         name={session.name}
                         onSave={(newName) => handleEditSessionName(session.id, newName)}
                       />
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>
                      {new Date(session.started_at).toLocaleString('zh-CN', {
                        month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                      })}
                      {session.ended_at ? ' - ' + new Date(session.ended_at).toLocaleString('zh-CN', {
                        hour: '2-digit', minute: '2-digit'
                      }) : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                      共 {session.product_count} 件商品
                      {session.sold_count > 0 && `  · 成交 ${session.sold_count} 单`}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: '#999' }}>
                    {expandedSessionId === session.id ? '收起 ▲' : '展开 ▼'}
                  </span>
                </div>

                {expandedSessionId === session.id && (
                  <div style={{ borderTop: '1px solid #f0f0f0', padding: '0 16px 12px' }}>
                    {expandedSessionLoading ? (
                      <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>加载中...</div>
                    ) : expandedSessionProducts.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 13 }}>
                        该场次暂无商品
                      </div>
                    ) : expandedSessionProducts.map((p, idx) => renderProductCard(p, idx))}
                  </div>
                )}
              </div>
            ))}

            {sessionsTotal > 10 && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <Pagination
                  current={sessionsPage}
                  pageSize={10}
                  total={sessionsTotal}
                  onChange={(p) => loadSessions(p)}
                  showTotal={(total) => `共 ${total} 场`}
                  size="small"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'draft' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>
        ) : draftProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无待上架商品</div>
        ) : (
          <div style={{ padding: '0 16px 80px' }}>
            {draftProducts.map((p, idx) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 0',
                borderBottom: idx < draftProducts.length - 1 ? '1px solid #f0f0f0' : 'none'
              }}>
                {p.image ? (
                  <img src={p.image} alt={p.name}
                    style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: '#f5f5f5' }}
                    onError={e => { e.target.style.display = 'none' }} />
                ) : (
                  <div style={{
                    width: 48, height: 48, borderRadius: 8,
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    flexShrink: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#fff', fontSize: 18
                  }}>🛍</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong ellipsis style={{ display: 'block', fontSize: 14 }}>{p.name || '未命名'}</Text>
                  <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                    {p.description?.slice(0, 30) || '暂无描述'}
                  </Text>
                </div>
                <Space size={4}>
                  <Tooltip title="编辑商品，创建竞拍">
                    <Button size="small" icon={<EditOutlined />}
                      onClick={() => handleEditProduct(p)} />
                  </Tooltip>
                  <Tooltip title="删除商品">
                    <Button size="small" danger icon={<DeleteOutlined />}
                      onClick={() => deleteProduct(p)} />
                  </Tooltip>
                </Space>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'profile' && (
        <div style={{ padding: '0 16px' }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '24px 0 20px'
          }}>
            {/* 隐藏的文件输入 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
            {/* 头像区域 - 可点击上传 */}
            <div
              onClick={handleAvatarClick}
              style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 28, fontWeight: 700, marginBottom: 12,
                cursor: 'pointer', position: 'relative', overflow: 'hidden',
                border: '2px solid rgba(255,255,255,0.3)'
              }}
            >
              {userInfo?.avatar ? (
                <img
                  src={`http://localhost:3000${userInfo.avatar}`}
                  alt="avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                (userInfo?.username || 'S').charAt(0).toUpperCase()
              )}
              {/* 底部半透明拍照图标 */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: 24, background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12
              }}>
                <CameraOutlined />
              </div>
              {uploadingAvatar && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(0,0,0,0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12
                }}>
                  上传中...
                </div>
              )}
            </div>
            <Text style={{ fontSize: 18, fontWeight: 600 }}>{userInfo?.username || '商家'}</Text>
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>账号 ID：{userInfo?.id || '-'}</Text>
            <Text type="secondary" style={{ fontSize: 11, marginTop: 4, color: '#999' }}>点击头像更换照片</Text>
          </div>

          <div style={{
            display: 'flex', marginBottom: 20,
            background: '#fff', borderRadius: 12,
            border: '1px solid #f0f0f0', overflow: 'hidden'
          }}>
            <div style={{
              flex: 1, textAlign: 'center', padding: '16px 12px',
              borderRight: '1px solid #f0f0f0'
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#667eea' }}>
                ¥{Number(stats.total_revenue).toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>总收入</div>
            </div>
            <div style={{
              flex: 1, textAlign: 'center', padding: '16px 12px'
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#667eea' }}>
                {stats.total_orders}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>成交订单数</div>
            </div>
          </div>

          <div style={{
            background: '#fff', borderRadius: 12, padding: 16,
            border: '1px solid #f0f0f0', marginBottom: 12
          }}>
            <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>个人简介</Text>
            <TextArea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="介绍一下你的店铺..."
              maxLength={100}
              showCount
              rows={3}
              style={{ borderRadius: 8, height: 100, marginBottom: 10 }}
            />
            <Button type="primary" block
              onClick={handleSaveBio}
              loading={savingBio}
              style={{ height: 44, borderRadius: 8, fontSize: 14 }}>
              保存简介
            </Button>
          </div>

          <Button
            type="default"
            danger
            block
            onClick={handleLogoutConfirm}
            style={{ height: 48, borderRadius: 8, fontSize: 15 }}>
            退出登录
          </Button>

          <div style={{ height: 24 }} />
        </div>
      )}

      {/* ===== 底部固定添加商品按钮（仅待上架 Tab） ===== */}
      {activeTab === 'draft' && (
        <div style={{
          position: 'fixed', bottom: 56, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 480, height: 72,
          background: '#fff', padding: '12px 16px',
          boxShadow: '0 -2px 8px rgba(0,0,0,0.06)',
          display: 'flex', alignItems: 'center', zIndex: 100
        }}>
          <Button type="primary" block
            style={{
              height: 48,
              fontSize: 16,
              borderRadius: 8,
              margin: '12px 16px',
              width: 'calc(100% - 32px)'
            }}
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}>
            添加商品
          </Button>
        </div>
      )}

      {/* ===== 底部导航栏 ===== */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%',
        transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480, height: 56,
        background: '#fff', borderTop: '1px solid #f0f0f0',
        display: 'flex', zIndex: 100, boxShadow: '0 -2px 8px rgba(0,0,0,0.04)'
      }}>
        <div onClick={() => setActiveTab('live')} style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          color: activeTab === 'live' ? '#667eea' : '#999',
          transition: 'color 0.2s'
        }}>
          <span style={{ fontSize: 20, marginBottom: 2 }}>🎬</span>
          <span style={{ fontSize: 10, fontWeight: activeTab === 'live' ? 600 : 400 }}>
            直播记录
          </span>
        </div>
        <div onClick={() => setActiveTab('draft')} style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          color: activeTab === 'draft' ? '#667eea' : '#999',
          transition: 'color 0.2s'
        }}>
          <span style={{ fontSize: 20, marginBottom: 2 }}>📦</span>
          <span style={{ fontSize: 10, fontWeight: activeTab === 'draft' ? 600 : 400 }}>
            待上架
          </span>
        </div>
        <div onClick={() => setActiveTab('profile')} style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          color: activeTab === 'profile' ? '#667eea' : '#999',
          transition: 'color 0.2s'
        }}>
          <span style={{ fontSize: 20, marginBottom: 2 }}>👤</span>
          <span style={{ fontSize: 10, fontWeight: activeTab === 'profile' ? 600 : 400 }}>
            个人中心
          </span>
        </div>
      </div>

      {/* ===== 添加商品 Drawer ===== */}
      <Drawer
        title="添加商品"
        placement="bottom"
        height="92vh"
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        style={{ maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0' }}
        rootStyle={{ maxWidth: 480, left: '50%', transform: 'translateX(-50%)' }}
        styles={{ header: { padding: '16px' }, body: { padding: '16px', overflowY: 'auto', paddingBottom: '80px' } }}
        footer={
          <Button type="primary" onClick={handleAdd} loading={adding} block style={{ height: 48, fontSize: 16, borderRadius: 8 }}>
            确认添加
          </Button>
        }
      >
        <Form form={addForm} layout="vertical">
          <Form.Item name="name" label="商品名称"
            rules={[{ required: true, message: '请输入商品名称' }]}>
            <Input placeholder="商品名称" style={{ height: 44, borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="image" label="商品图片">
            <ImageUpload />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={4} placeholder="商品描述" style={{ borderRadius: 8, height: 100 }} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* ===== 编辑商品 + 创建竞拍 Drawer ===== */}
      <Drawer
        title={`编辑商品 - ${editingProduct?.name || ''}`}
        placement="bottom"
        height="92vh"
        open={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditingProduct(null) }}
        style={{ maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0' }}
        rootStyle={{ maxWidth: 480, left: '50%', transform: 'translateX(-50%)' }}
        styles={{ header: { padding: '16px' }, body: { padding: '16px', overflowY: 'auto', paddingBottom: '80px' } }}
        footer={
          <Button type="primary" onClick={handleSaveEdit} block
            disabled={!isLive}
            title={!isLive ? '请先开播' : ''}
            style={{ height: 48, fontSize: 16, borderRadius: 8 }}>
            创建竞拍
          </Button>
        }
      >
        <Form form={editForm} layout="vertical">
          <Divider orientation="left" plain style={{ fontSize: 14 }}>商品信息</Divider>
          <Form.Item name="name" label="商品名称"
            rules={[{ required: true, message: '请输入商品名称' }]}>
            <Input placeholder="商品名称" style={{ height: 44, borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="image" label="商品图片">
            <ImageUpload />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={4} placeholder="商品描述" style={{ borderRadius: 8, height: 100 }} />
          </Form.Item>
          <Divider orientation="left" plain style={{ fontSize: 14 }}>竞拍设置</Divider>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Form.Item name="start_price" label="起拍价"
                rules={[{ required: true, message: '必填' }]}>
                <Input placeholder="起拍价" prefix="¥" style={{ height: 44, borderRadius: 8 }} />
              </Form.Item>
            </div>
            <div style={{ flex: 1 }}>
              <Form.Item name="price_step" label="加价幅度"
                rules={[{ required: true, message: '必填' }]}>
                <Input placeholder="幅度" prefix="¥" style={{ height: 44, borderRadius: 8 }} />
              </Form.Item>
            </div>
            <div style={{ flex: 1 }}>
              <Form.Item
                name="max_price"
                label="封顶价(可选)"
                dependencies={['start_price']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (value === undefined || value === null || String(value).trim() === '') {
                        return Promise.resolve()
                      }
                      const max = Number(value)
                      const start = Number(getFieldValue('start_price'))
                      if (!Number.isFinite(max) || max <= 0) {
                        return Promise.reject(new Error('封顶价必须为大于0的数字'))
                      }
                      if (Number.isFinite(start) && start > 0 && max < start) {
                        return Promise.reject(new Error('封顶价不能低于起拍价'))
                      }
                      return Promise.resolve()
                    }
                  })
                ]}
              >
                <Input placeholder="可选" prefix="¥" style={{ height: 44, borderRadius: 8 }} />
              </Form.Item>
            </div>
          </div>
          <Form.Item name="duration" label="时长（秒）"
            rules={[{ required: true, message: '请输入竞拍时长' }]}>
            <Input placeholder="例如 300" suffix="秒" style={{ height: 44, borderRadius: 8 }} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* ===== 订单详情 Drawer ===== */}
      <Drawer
        title={`订单详情 - ${ordersModal?.product_name || ''}`}
        placement="bottom"
        height="85vh"
        open={!!ordersModal}
        onClose={() => setOrdersModal(null)}
        style={{ maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0' }}
        rootStyle={{ maxWidth: 480, left: '50%', transform: 'translateX(-50%)' }}
        styles={{ header: { padding: '16px' }, body: { padding: '12px 16px', overflowY: 'auto' } }}
      >
        {ordersModal && (ordersModal.orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无订单</div>
        ) : (
          ordersModal.orders.map(order => (
            <div key={order.id} style={{ marginBottom: 12 }}>
              {/* 商品信息 & 买家 */}
              <div style={{
                background: '#fff', borderRadius: 12, overflow: 'hidden',
                border: '1px solid #f0f0f0'
              }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>商品</Text>
                  <Text style={{ fontSize: 14, fontWeight: 500 }}>{order.product_name}</Text>
                </div>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>成交价</Text>
                  <Text strong style={{ fontSize: 16, color: '#e84343' }}>¥{Number(order.final_price).toFixed(2)}</Text>
                </div>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>买家</Text>
                  <Text style={{ fontSize: 13 }}>{order.buyer_name || '-'}</Text>
                </div>
                {/* 支付信息 */}
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>支付方式</Text>
                  <Text style={{ fontSize: 13 }}>{order.payment_method || '-'}</Text>
                </div>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>支付状态</Text>
                  <Tag color={order.payment_status === 'paid' ? 'success' : order.payment_status === 'cancelled' ? 'warning' : 'processing'}>
                    {order.payment_status === 'paid' ? '已成交' : order.payment_status === 'cancelled' ? '已取消' : '待支付'}
                  </Tag>
                </div>
                {/* 物流操作 - 只有已支付订单才显示 */}
                {order.payment_status === 'paid' && (
                  <div style={{
                    marginTop: 12, background: '#fff', borderRadius: 12,
                    border: '1px solid #f0f0f0', padding: '14px 16px'
                  }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>物流操作</Text>
                    <div style={{ marginBottom: 12, fontSize: 14 }}>
                      当前状态：
                      <span style={{
                        fontWeight: 600, marginLeft: 4,
                        color: (order.logistics_status === '已签收') ? '#52c41a'
                          : (order.logistics_status === '已发货') ? '#1677ff' : '#999'
                      }}>
                        {(() => {
                          const s = order.logistics_status || '未发货'
                          if (s === '已签收') return '✅ 买家已签收，订单完成'
                          if (s === '已发货') return '🚚 已发货'
                          return '⏳ 待发货'
                        })()}
                      </span>
                    </div>
                    {(order.logistics_status !== '已发货' && order.logistics_status !== '已签收') && (
                      <Button type="primary" block
                        style={{ height: 44, borderRadius: 8, background: '#52c41a', borderColor: '#52c41a', marginTop: 8 }}
                        onClick={() => handleShip(order.id)}>
                        确认发货
                      </Button>
                    )}
                    {order.logistics_status === '已发货' && (
                      <div style={{
                        fontSize: 13, textAlign: 'center',
                        color: '#1677ff',
                        fontWeight: 500,
                        padding: '8px 0'
                      }}>
                        📦 已发出，等待买家签收
                      </div>
                    )}
                    {order.logistics_status === '已签收' && (
                      <div style={{
                        fontSize: 13, textAlign: 'center',
                        color: '#52c41a',
                        fontWeight: 600,
                        padding: '8px 0'
                      }}>
                        🎉 订单已完成
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        ))}
      </Drawer>
    </div>
  )
}

import { useState, useEffect, useMemo, useRef } from 'react'
import { Typography, InputNumber, Button, Space, Tag, Modal, message } from 'antd'
import {
  MinusOutlined, PlusOutlined, RiseOutlined,
  CrownOutlined, FrownOutlined, ClockCircleOutlined
} from '@ant-design/icons'
import api from '../api'

const { Text } = Typography

/** 排名图标 */
const rankIcons = [
  <span style={{ fontWeight: 700, fontSize: 13 }}>🥇</span>,
  <span style={{ fontWeight: 700, fontSize: 13 }}>🥈</span>,
  <span style={{ fontWeight: 700, fontSize: 13 }}>🥉</span>
]

/**
 * BidPanel — 竞拍详情出价弹层组件（三种状态 + 出价排行榜）
 *
 * Props 接口：
 *   status           'none' | 'leading' | 'outbid'   当前用户出价状态
 *   currentPrice     Number   当前全场最高价
 *   myBid            Number   当前用户最高出价（null=未出价）
 *   bidIncrement     Number   加价幅度
 *   maxPrice         Number   封顶价（null=无封顶）
 *   onBid            Function (amount) => Promise     出价回调
 *   onBidSuccess     Function (amount) => void       出价成功后外部同步
 *   loading          Boolean   是否正在出价中
 *   auctionId        Number|String   当前竞拍ID（用于请求排行榜）
 *   currentUserId    Number|String   当前登录用户ID（用于高亮）
 *   bidUpdateCount   Number   出价更新计数器，变化时刷新排行榜
 *   leaderboardData  Array    WebSocket 推送的排行榜数据（优先使用，无需 HTTP 请求）
 *   currentUsername  String   当前登录用户名（用于 Redis 排行榜高亮）
 *   totalBidCount    Number   真实出价次数（从 MySQL，WebSocket 推送）
 *   participantCount Number   参与人数（从 Redis ZSet，WebSocket 推送）
 */
export default function BidPanel({
  status = 'none',
  currentPrice = 0,
  myBid = null,
  bidIncrement = 10,
  maxPrice = null,
  onBid,
  onBidSuccess,
  loading = false,
  auctionId,
  currentUserId,
  bidUpdateCount = 0,
  leaderboardData = [],
  currentUsername = '',
  totalBidCount = 0,
  participantCount = 0
}) {
  const [bids, setBids] = useState([])
  const [bidsLoading, setBidsLoading] = useState(false)
  // 出价统计：优先用 WebSocket 推送的 props，回退到本地 HTTP 获取的值
  const [localTotalBidCount, setLocalTotalBidCount] = useState(0)
  const [localParticipantCount, setLocalParticipantCount] = useState(0)

  const displayTotalBidCount = totalBidCount > 0 ? totalBidCount : localTotalBidCount
  const displayParticipantCount = participantCount > 0 ? participantCount : (localParticipantCount || bids.length)

  // 最低出价规则：
  //  - 第一笔出价：最低 = 起拍价（此时 bids 为空，currentPrice 通常等于起拍价）
  //  - 第二笔及之后：最低 = 当前最高价 + 加价幅度
  const hasAnyBid = bids.length > 0
  const minBid = useMemo(() => {
    const cp = Number(currentPrice)
    const inc = Number(bidIncrement)
    return hasAnyBid ? (cp + inc) : cp
  }, [currentPrice, bidIncrement, hasAnyBid])
  const [amount, setAmount] = useState(minBid)
  const [msg, setMsg] = useState('')
  const lastBidTime = useRef(0)

  useEffect(() => {
    setAmount(minBid)
    setMsg('')
  }, [minBid, status])

  // ========== 加载出价排行榜（优先使用 WebSocket 推送数据） ==========
  useEffect(() => {
    if (leaderboardData && leaderboardData.length > 0) {
      setBids(leaderboardData)
      return
    }
    if (!auctionId) return
    (async () => {
      setBidsLoading(true)
      try {
        const res = await api.get(`/auctions/${auctionId}/bids`)
        setBids(res.bids || [])
        // 从 HTTP 响应更新两个计数
        if (res.total_bid_count !== undefined) {
          setLocalTotalBidCount(res.total_bid_count)
        }
        if (res.participant_count !== undefined) {
          setLocalParticipantCount(res.participant_count)
        }
      } catch (_) {}
      finally { setBidsLoading(false) }
    })()
  }, [auctionId, bidUpdateCount])

  // ========== 出价逻辑 ==========
  const handleBid = async () => {
    setMsg('')
    if (amount < minBid) {
      setMsg(`最低出价 ¥${minBid.toFixed(2)}`)
      return
    }
    if (maxPrice && amount > Number(maxPrice)) {
      setMsg(`不能超过封顶价 ¥${Number(maxPrice).toFixed(2)}`)
      return
    }

    // 自超确认：如果 status 是 leading，确认继续加价
    if (status === 'leading') {
      return new Promise((resolve) => {
        Modal.confirm({
          title: '确认继续加价',
          content: `当前您已是最高价，确认加价至 ¥${amount.toFixed(2)}？`,
          okText: '确认加价',
          cancelText: '取消',
          onOk: async () => {
            await doBid()
            resolve()
          },
          onCancel: () => resolve()
        })
      })
    }

    await doBid()
  }

  const doBid = async () => {
    try {
      await onBid?.(amount)
      // WebSocket 预留：出价成功后通知外部
      onBidSuccess?.(amount)
    } catch (err) {
      setMsg(err?.message || '出价失败，请重试')
    }
  }

  // ========== 出价按钮节流（1秒内防连点） ==========
  const handleBidClick = () => {
    const now = Date.now()
    if (now - lastBidTime.current < 1000) {
      message.warning('出价太频繁，请稍候')
      return
    }
    handleBid().finally(() => {
      lastBidTime.current = Date.now()
  })
}

  // ========== 加减按钮 ==========
  const inc = () => setAmount(prev => {
    const next = Number(prev || minBid) + Number(bidIncrement)
    if (maxPrice && next > Number(maxPrice)) return Number(maxPrice)
    return next
  })

  const dec = () => setAmount(prev => {
    const next = Number(prev || minBid) - Number(bidIncrement)
    if (next < minBid) return minBid
    return next
  })

  // ========== 渲染 ==========
  return (
    <div style={{ 
      background: '#1A1A1A', 
      borderTop: '1px solid rgba(255,255,255,0.12)',
      color: '#FFFFFF',
      padding: '8px 0' 
    }}>
      {/* ---- 状态①：未出价 ---- */}
      {status === 'none' && (
        <div style={{ textAlign: 'center', marginBottom: 16, background: 'rgba(255,255,255,0.06)', padding: '10px 16px', borderRadius: 10, marginLeft: 12, marginRight: 12 }}>
          <Tag color="default" style={{ fontSize: 13, padding: '4px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#FFFFFF' }}>
            📋 暂无出价
          </Tag>
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
            当前最高价
            <Text strong style={{ color: '#FF2748', fontSize: 15, marginLeft: 4 }}>
              ¥{Number(currentPrice).toFixed(2)}
            </Text>
          </Text>
        </div>
      )}

      {/* ---- 状态②：我是最高价 ---- */}
      {status === 'leading' && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            background: '#2A1F00',
            borderRadius: 10, padding: '12px 20px', display: 'inline-block',
            border: '1px solid #FFB800'
          }}>
            <Tag color="gold" style={{ fontSize: 13, padding: '2px 10px', background: 'rgba(255,184,0,0.15)', border: 'none', color: '#FFB800' }}>
              <CrownOutlined style={{ color: '#FFB800' }} /> 当前您已是最高价
            </Tag>
            <div style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 13, color: '#FFB800' }}>
                我的出价
                <Text strong style={{ fontSize: 15, color: '#FFB800', margin: '0 4px' }}>
                  ¥{Number(myBid).toFixed(2)}
                </Text>
                | 仍可继续加价
              </Text>
            </div>
          </div>
        </div>
      )}

      {/* ---- 状态③：被超越（红色动画） ---- */}
      {status === 'outbid' && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div className="outbid-banner" style={{
            background: 'linear-gradient(135deg, #2D0000, #1A0000)',
            borderRadius: 10, padding: '12px 20px', display: 'inline-block',
            border: '1px solid rgba(255,39,72,0.4)',
            animation: 'outbidPulse 0.6s ease-in-out 2'
          }}>
            <Text strong style={{ color: '#FF2748', fontSize: 14 }}>
              <FrownOutlined style={{ marginRight: 4, color: '#FF2748' }} />
              您的出价已被超越！
            </Text>
            <div style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 13, color: '#FF2748' }}>
                当前最高
                <Text strong style={{ fontSize: 15, color: '#FF2748', margin: '0 4px' }}>
                  ¥{Number(currentPrice).toFixed(2)}
                </Text>
                | 我的出价
                <Text style={{ marginLeft: 2, color: 'rgba(255,255,255,0.4)' }}>
                  ¥{Number(myBid).toFixed(2)}
                </Text>
              </Text>
            </div>
            <div style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: '#FF2748', fontStyle: 'italic' }}>
                赶快重新出价抢回来吧！
              </Text>
            </div>
          </div>
        </div>
      )}

      {/* ---- 出价输入区域 ---- */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
          最低出价
          <Text strong style={{ color: '#FF2748', margin: '0 4px' }}>
            ¥{minBid.toFixed(2)}
          </Text>
          {maxPrice != null && maxPrice > 0
            ? <>| 封顶价 <Text strong style={{ color: '#FFFFFF' }}>¥{Number(maxPrice).toFixed(2)}</Text></>
            : '| 无封顶'
          }
        </Text>
      </div>

      {/* 输入整行容器 */}
      <div style={{ width: '100%', background: '#2A2A2A', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Button
          icon={<MinusOutlined style={{ fontSize: 20 }} />}
          onClick={dec}
          disabled={loading || amount <= minBid}
          style={{ 
            width: 44, 
            height: 44,
            background: '#3A3A3A', 
            color: '#FFFFFF',
            borderRadius: 8,
            border: 'none',
            fontSize: 20
          }}
        />
        <InputNumber
          style={{ 
            flex: 1, 
            textAlign: 'center',
            background: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            height: 44
          }}
          size="large"
          value={amount}
          onChange={v => setAmount(v)}
          step={Number(bidIncrement)}
          min={minBid}
          max={maxPrice || 999999999}
          precision={2}
          controls={false}
          disabled={loading}
        />
        <Button
          icon={<PlusOutlined style={{ fontSize: 20 }} />}
          onClick={inc}
          disabled={loading || (maxPrice && amount >= Number(maxPrice))}
          style={{ 
            width: 44, 
            height: 44,
            background: '#3A3A3A', 
            color: '#FFFFFF',
            borderRadius: 8,
            border: 'none',
            fontSize: 20
          }}
        />
      </div>

      <Button
        type="primary"
        size="large"
        block
        onClick={handleBidClick}
        loading={loading}
        icon={<RiseOutlined />}
        style={{
          height: 44, borderRadius: 999, fontSize: 16, fontWeight: 600,
          background: '#FF2748',
          color: '#FFFFFF',
          border: 'none'
        }}>
        立即出价
      </Button>

      {msg && (
        <Text type="danger" style={{
          display: 'block', textAlign: 'center', marginTop: 8,
          fontSize: 12, background: 'rgba(255,39,72,0.15)', padding: '4px 12px',
          borderRadius: 4, color: '#FF2748'
        }}>
          {msg}
        </Text>
      )}

      {/* ========== 出价排行榜 ========== */}
      {auctionId && (
        <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, background: '#222222', marginLeft: 12, marginRight: 12, borderRadius: 10, paddingLeft: 12, paddingRight: 12, paddingBottom: 8 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 8
          }}>
            <Text strong style={{ fontSize: 13, color: '#FFFFFF' }}>出价排行</Text>
            <Text type="secondary" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              {displayParticipantCount > 0
                ? `共 ${displayParticipantCount} 人出价 · ${displayTotalBidCount} 次`
                : '暂无出价'
              }
            </Text>
          </div>

          {bids.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.4)', fontSize: 12
            }}>
              {bidsLoading ? '加载中...' : '暂无出价，快来抢第一'}
            </div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {bids.slice(0, 10).map((bid, i) => {
                const isMe = currentUserId != null ? Number(bid.user_id) === Number(currentUserId) : false
                const isMeByName = currentUsername && bid.username === currentUsername
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 4px', borderRadius: 6,
                    background: isMe || isMeByName ? 'rgba(255,183,0,0.08)' : 'transparent',
                    marginBottom: 2
                  }}>
                    {/* 排名 */}
                    <div style={{
                      width: 22, textAlign: 'center', flexShrink: 0,
                      fontSize: 12, fontWeight: 600,
                      color: i < 3 ? undefined : 'rgba(255,255,255,0.4)'
                    }}>
                      {i < 3 ? rankIcons[i] : `#${i + 1}`}
                    </div>
                    {/* 用户名 */}
                    <div style={{
                      flex: 1, fontSize: 12, fontWeight: isMe || isMeByName ? 600 : 400,
                      color: '#FFFFFF',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                      {bid.username}
                      {(isMe || isMeByName) && <Tag color="processing" style={{ fontSize: 9, lineHeight: '14px', marginLeft: 4, padding: '1px 6px', background: 'rgba(255,39,72,0.2)', border: 'none', color: '#FF2748', borderRadius: 4 }}>我</Tag>}
                    </div>
                    {/* 出价金额 */}
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: '#FFB800', flexShrink: 0
                    }}>
                      ¥{Number(bid.amount).toFixed(2)}
                    </div>
                    {/* 出价时间 */}
                    {bid.created_at && (
                      <div style={{
                        fontSize: 10, color: 'rgba(255,255,255,0.4)', flexShrink: 0, width: 50, textAlign: 'right'
                      }}>
                        {new Date(bid.created_at).toLocaleString('zh-CN', {
                          hour: '2-digit', minute: '2-digit', second: '2-digit'
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

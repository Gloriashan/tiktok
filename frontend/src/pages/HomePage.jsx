import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Typography, Tag, message } from 'antd'
import { VideoCameraOutlined, UserOutlined } from '@ant-design/icons'
import api from '../api'
import useStore from '../store'
import socket from '../socket'

const { Title, Text } = Typography

/** 订单状态对应标签 */
const statusConfig = {
  unpaid:     { color: 'error',       label: '待支付' },
  paid:       { color: 'success',     label: '已成交' },
  cancelled:  { color: 'warning',     label: '已取消' }
}

export default function HomePage() {
  const navigate = useNavigate()
  const userInfo = useStore(s => s.userInfo)
  const [merchants, setMerchants] = useState([])
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])

  const isUser = userInfo?.role === 'user'

  // ========== 加载商家列表 ==========
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/merchants')
        setMerchants(res.data.list || [])
      } catch (err) { message.error(err.message || '加载失败') }
      finally { setLoading(false) }
    })()
  }, [])

  // ========== WebSocket — 监听大厅全局广播 ==========
  useEffect(() => {
    socket.connect()

    socket.on('merchant_updated', (data) => {
      setMerchants(prev => prev.map(m =>
        Number(m.id) === Number(data.merchant_id)
          ? { ...m, product_count: Math.max(0, (m.product_count || 0) + data.live_count) }
          : m
      ))
    })

    socket.on('merchant_live_status', ({ merchantId, isLive, username }) => {
      if (isLive) {
        setMerchants(prev => {
          if (prev.some(m => Number(m.id) === Number(merchantId))) return prev
          return [...prev, {
            id: Number(merchantId),
            username: username || '商家',
            is_live: 1,
            product_count: 0
          }]
        })
      } else {
        setMerchants(prev => prev.filter(m => Number(m.id) !== Number(merchantId)))
      }
    })

    socket.on('merchant_product_count_update', (data) => {
      setMerchants(prev => prev.map(m =>
        Number(m.id) === Number(data.merchant_id)
          ? { ...m, product_count: data.live_product_count }
          : m
      ))
    })

    return () => {
      socket.off('merchant_updated')
      socket.off('merchant_live_status')
      socket.off('merchant_product_count_update')
    }
  }, [])

  // ========== 加载订单列表（仅买家） ==========
  useEffect(() => {
    console.log('[我的订单 useEffect 执行了]', userInfo)
    if (!userInfo) return  // 未登录不请求
    if (userInfo.role !== 'user') return
    (async () => {
      try {
        const res = await api.get('/orders/my-orders')
        console.log('[我的订单] 请求成功:', res)
        const list = res.orders || []
        // pending 排前面，其余按创建时间倒序
        list.sort((a, b) => {
          if (a.payment_status === 'unpaid' && b.payment_status !== 'unpaid') return -1
          if (b.payment_status === 'unpaid' && a.payment_status !== 'unpaid') return 1
          return new Date(b.created_at) - new Date(a.created_at)
        })
        setOrders(list)
      } catch (err) {
        console.error('[我的订单] 请求失败:', err.message, err.response?.status, err.response?.data)
      }
    })()
  }, [userInfo])

  /** 获取商家首字母作为头像 */
  const getInitial = (name) => name?.charAt(0)?.toUpperCase() || 'S'

  const getFullAvatarUrl = (avatar) => {
    return avatar ? `http://localhost:3000${avatar}` : null
  }

  // ========== 订单倒计时每秒更新 ==========
  const [remainingMap, setRemainingMap] = useState({})
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      const updated = {}
      let changed = false
      for (const order of orders) {
        if (order.payment_status !== 'unpaid') continue
        const expireAt = new Date(order.created_at).getTime() + 15 * 60 * 1000
        const sec = Math.max(0, Math.floor((expireAt - now) / 1000))
        updated[order.id] = sec
        if (sec !== (remainingMap[order.id] ?? undefined)) changed = true
      }
      if (changed) setRemainingMap(updated)
    }, 1000)
    return () => clearInterval(timer)
  }, [orders])

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f5f5f5'
    }}>
      {/* ===== 固定顶部导航栏 ===== */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480, height: 56, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#333' }}>竞拍大厅</div>
        <div onClick={() => navigate('/profile')}
          style={{ fontSize: 14, color: '#667eea', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          {userInfo?.avatar ? (
            <img 
              src={`http://localhost:3000${userInfo.avatar}`} 
              alt="avatar" 
              style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} 
            />
          ) : (
            <UserOutlined />
          )}
          {userInfo?.username || '个人中心'}
        </div>
      </div>

      {/* ===== 内容区域 ===== */}
      <div style={{
        flex: 1, overflowY: 'auto',
        paddingTop: 56,
        paddingBottom: 56
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>加载中...</div>
        ) : merchants.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
            <Title level={4} type="secondary">暂无在线商家</Title>
            <Text>请等待商家开启直播</Text>
          </div>
        ) : (
          <div style={{ padding: '0 16px' }}>
            {merchants.map(m => (
              <div
                key={m.id}
                onClick={() => navigate(`/live/${m.id}`)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: 16, marginBottom: 12, borderRadius: 12,
                  background: '#fff', cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
                }}
              >
              {/* 左侧头像（优先显示商家上传的头像，否则显示首字母圆） */}
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 20, fontWeight: 700, flexShrink: 0,
                  overflow: 'hidden'
                }}>
                  {m.avatar ? (
                    <img 
                      src={getFullAvatarUrl(m.avatar)} 
                      alt="avatar" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  ) : (
                    getInitial(m.username)
                  )}
                </div>

                {/* 右侧商家名 + 在播商品数 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Text strong style={{ fontSize: 15 }}>{m.username}</Text>
                    <Tag color="success" style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>
                      <VideoCameraOutlined /> 直播中
                    </Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                    在播商品 {m.product_count || 0} 件
                  </Text>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

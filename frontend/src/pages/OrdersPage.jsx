import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Tag, message, Button, Modal } from 'antd'
import { ClockCircleOutlined, ArrowLeftOutlined, SearchOutlined, InboxOutlined, AppstoreOutlined } from '@ant-design/icons'
import api from '../api'
import useStore from '../store'
import socket from '../socket'

const statusConfig = {
  unpaid:     { color: 'error',   label: '待支付' },
  paid:       { color: 'success', label: '已成交' },
  cancelled:  { color: 'warning', label: '已取消' }
}

const tabsData = ['全部', '待支付', '待发货', '待收货/使用', '评价', '售后']

export default function OrdersPage() {
  const navigate = useNavigate()
  const userInfo = useStore(s => s.userInfo)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [remainingMap, setRemainingMap] = useState({})
  const [activeTab, setActiveTab] = useState(0)
  const tabsContainerRef = useRef(null)

  useEffect(() => {
    if (!userInfo) return
    if (userInfo.role !== 'user') { navigate('/home', { replace: true }); return }
    ;(async () => {
      try {
        const res = await api.get('/orders/my-orders')
        const list = res.orders || []
        list.sort((a, b) => {
          if (a.payment_status === 'unpaid' && b.payment_status !== 'unpaid') return -1
          if (b.payment_status === 'unpaid' && a.payment_status !== 'unpaid') return 1
          return new Date(b.created_at) - new Date(a.created_at)
        })
        setOrders(list)
      } catch (err) {
        message.error(err.message || '加载订单失败')
      } finally { setLoading(false) }
    })()
  }, [userInfo])

  // 倒计时每秒更新
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now(); const updated = {}; let changed = false
      for (const o of orders) {
        if (o.payment_status !== 'unpaid') continue
        const sec = Math.max(0, Math.floor((new Date(o.created_at).getTime() + 15 * 60 * 1000 - now) / 1000))
        updated[o.id] = sec
        if (sec !== (remainingMap[o.id] ?? undefined)) changed = true
      }
      if (changed) setRemainingMap(updated)
    }, 1000)
    return () => clearInterval(timer)
  }, [orders])

  // ========== 监听物流状态实时更新 ==========
  useEffect(() => {
    if (!socket.connected) socket.connect()
    socket.emit('join_user_room', userInfo?.id)

    const handler = ({ orderId, logisticsStatus }) => {
      setOrders(prev => prev.map(o =>
        Number(o.id) === Number(orderId)
          ? { ...o, logistics_status: logisticsStatus }
          : o
      ))
    }

    socket.on('order_logistics_update', handler)
    return () => { socket.off('order_logistics_update', handler) }
  }, [])

  // ========== 确认签收 ==========
  const handleConfirmReceipt = (orderId) => {
    Modal.confirm({
      title: '确认已收到商品？',
      content: '签收后订单将完成，请确认商品已收到且无误',
      okText: '确认签收',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.post(`/orders/${orderId}/confirm-receipt`)
          message.success('签收成功！')
          // 立即更新本地状态
          setOrders(prev => prev.map(o =>
            Number(o.id) === Number(orderId)
              ? { ...o, logistics_status: '已签收' }
              : o
          ))
          // 后台静默刷新确保数据一致
          api.get('/orders/my-orders').then(res => {
            const list = res.orders || []
            list.sort((a, b) => {
              if (a.payment_status === 'unpaid' && b.payment_status !== 'unpaid') return -1
              if (b.payment_status === 'unpaid' && a.payment_status !== 'unpaid') return 1
              return new Date(b.created_at) - new Date(a.created_at)
            })
            if (list.length > 0) setOrders(list)
          }).catch(() => {})
        } catch (err) {
          message.error(err?.message || '签收失败，请重试')
        }
      }
    })
  }

  // ========== 物流状态展示 ==========
  const getLogisticsDisplay = (logisticsStatus) => {
    const s = logisticsStatus || '未发货'
    if (s === '已发货') return { text: '🚚 运输中', color: '#1677ff' }
    if (s === '已签收') return { text: '✅ 已签收', color: '#52c41a' }
    return { text: '⏳ 待发货', color: '#999' }
  }

  return (
    <div style={{ 
      background: '#F7F7F7',
      minHeight: '100vh',
      maxWidth: '480px',
      margin: '0 auto',
      position: 'relative',
      paddingBottom: '56px' 
    }}>
      {/* 顶部导航 */}
      <div style={{
        background: '#FFFFFF',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 0 #EEEEEE',
        height: 48,
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        {/* 左侧返回箭头 */}
        <ArrowLeftOutlined 
          style={{ color: '#222222', fontSize: 24, cursor: 'pointer' }} 
          onClick={() => navigate(-1)}
        />
        {/* 中间搜索框 */}
        <div style={{
          flex: 1,
          background: '#EEEEEE',
          borderRadius: 999,
          height: 36,
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer'
        }}>
          <SearchOutlined style={{ color: '#999999', fontSize: 16 }} />
          <span style={{ color: '#999999', fontSize: 15 }}>搜索商品名/订单号/快递单号</span>
        </div>
        {/* 右侧两个图标 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <InboxOutlined style={{ color: '#222222', fontSize: 26, cursor: 'pointer' }} />
          <AppstoreOutlined style={{ color: '#222222', fontSize: 26, cursor: 'pointer' }} />
        </div>
      </div>

      {/* Tab 分类标签栏 */}
      <div 
        ref={tabsContainerRef}
        style={{
          background: '#FFFFFF',
          height: 56,
          display: 'flex',
          padding: '0 4px',
          borderBottom: '1px solid #EEEEEE',
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}
      >
        <style>{`
          #tabs-container::-webkit-scrollbar { display: none; }
        `}</style>
        <div id="tabs-container" style={{ display: 'flex' }}>
          {tabsData.map((tab, index) => (
            <div 
              key={index}
              onClick={() => setActiveTab(index)}
              style={{
                flexShrink: 0,
                padding: '0 12px',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                cursor: 'pointer',
                color: activeTab === index ? '#222222' : '#666666',
                fontSize: activeTab === index ? 17 : 16,
                fontWeight: activeTab === index ? 700 : 400
              }}
            >
              {tab}
              {/* 选中态下划线 */}
              {activeTab === index && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 28,
                  height: 3,
                  background: '#FF3838',
                  borderRadius: 2
                }} />
              )}
              {/* "待收货/使用" 右上角红点 */}
              {tab === '待收货/使用' && (
                <div style={{
                  position: 'absolute',
                  top: 8,
                  right: 2,
                  width: 18,
                  height: 18,
                  background: '#FF3838',
                  borderRadius: '50%',
                  color: '#FFFFFF',
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  2
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>加载中...</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#999' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <div>暂无订单记录</div>
        </div>
      ) : (
        <div style={{ padding: '16px 16px 0' }}>
          {orders.map(order => {
            const status = order.payment_status === 'pending' ? 'unpaid' : order.payment_status
            const cfg = statusConfig[status] || { color: 'default', label: status }
            const isUnpaid = status === 'unpaid'
            const remaining = remainingMap[order.id] ?? (isUnpaid
              ? Math.max(0, Math.floor((new Date(order.created_at).getTime() + 15 * 60 * 1000 - Date.now()) / 1000)) : 0)
            const m = String(Math.floor(remaining / 60)).padStart(2, '0')
            const s = String(remaining % 60).padStart(2, '0')

            return (
              <Card key={order.id}
                style={{ marginBottom: 10, borderRadius: 12 }}
                styles={{ body: { padding: 14 } }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 4 }}>
                      {order.product_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                      成交时间：{new Date(order.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#e84343' }}>
                      ¥{Number(order.final_price).toFixed(2)}
                    </div>
                  </div>
                  <Tag color={cfg.color} style={{ borderRadius: 8 }}>{cfg.label}</Tag>
                </div>

                {isUnpaid && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0'
                  }}>
                    <div style={{ fontSize: 12, color: remaining < 60 ? '#ff4d4f' : '#fa8c16', fontWeight: 600 }}>
                      <ClockCircleOutlined style={{ marginRight: 4 }} />
                      剩余 {m}:{s}
                    </div>
                    <button onClick={() => navigate(`/pay/${order.id}`)}
                      style={{
                        padding: '8px 24px', borderRadius: 20, border: 'none',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff'
                      }}>去支付</button>
                  </div>
                )}

                {/* 物流信息 */}
                {status === 'paid' && (
                  <div style={{
                    marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: '#666' }}>配送状态</span>
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: getLogisticsDisplay(order.logistics_status).color
                      }}>
                        {getLogisticsDisplay(order.logistics_status).text}
                      </span>
                    </div>
                    {order.logistics_status === '已发货' && (
                      <Button
                        type="primary"
                        block
                        style={{
                          height: 40, borderRadius: 8,
                          background: '#52c41a', borderColor: '#52c41a'
                        }}
                        onClick={() => handleConfirmReceipt(order.id)}
                      >
                        确认签收
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { message } from 'antd'
import {
  CheckCircleFilled, CloseCircleFilled,
  WalletOutlined, ClockCircleOutlined, FileTextOutlined
} from '@ant-design/icons'
import api from '../api'

const PAY_TIMEOUT = 15 * 60 * 1000 // 15 分钟

export default function PaymentPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()

  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paid, setPaid] = useState(false)
  const [method, setMethod] = useState('')
  const [paying, setPaying] = useState(false)
  const [remaining, setRemaining] = useState(PAY_TIMEOUT)
  const [timeoutExpired, setTimeoutExpired] = useState(false)
  const expireAtRef = useRef(0)

  // ========== 加载订单 ==========
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/orders/${orderId}`)
        const data = res.data
        setOrder(data)
        if (data.payment_status === 'paid') {
          setPaid(true)
          return
        }
        if (data.payment_status === 'cancelled') {
          setTimeoutExpired(true)
          return
        }
        // 基于订单创建时间计算过期时刻
        const createdAt = new Date(data.created_at).getTime()
        const expireAt = createdAt + PAY_TIMEOUT
        expireAtRef.current = expireAt
        const left = expireAt - Date.now()
        if (left <= 0) {
          // 进入页面时已超时
          setTimeoutExpired(true)
          // 顺便通知后端取消
          api.post(`/orders/${orderId}/cancel`).catch(() => {})
        } else {
          setRemaining(left)
        }
      } catch (err) {
        message.error(err.message || '获取订单失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [orderId])

  // ========== 支付倒计时（基于订单创建时间，不是页面加载时间） ==========
  useEffect(() => {
    if (paid || timeoutExpired) return
    const timer = setInterval(() => {
      const left = Math.max(0, expireAtRef.current - Date.now())
      setRemaining(left)
      if (left <= 0) {
        // 支付时间到：取消订单
        api.post(`/orders/${orderId}/cancel`).catch(() => {})
        setTimeoutExpired(true)
        clearInterval(timer)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [paid, timeoutExpired])

  // ========== 确认支付 ==========
  const handlePay = async () => {
    if (timeoutExpired) {
      message.warning('订单已取消')
      return
    }
    if (!method) {
      message.warning('请选择支付方式')
      return
    }
    setPaying(true)
    try {
      await api.post(`/orders/${orderId}/pay`, { payment_method: method })
      setPaid(true)
    } catch (err) {
      message.error(err.message || '支付失败')
    } finally {
      setPaying(false)
    }
  }

  // ========== 格式化时间 ==========
  const minutes = String(Math.floor(remaining / 60000)).padStart(2, '0')
  const seconds = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')

  // ========== 倒计时归零后 3 秒自动跳转首页 ==========
  useEffect(() => {
    if (!timeoutExpired) return
    const timer = setTimeout(() => navigate('/', { replace: true }), 3000)
    return () => clearTimeout(timer)
  }, [timeoutExpired])

  // ========== 加载中 ==========
  if (loading) {
    return (
      <div style={{
        width: 375, maxWidth: '100vw', minHeight: '100vh', margin: '0 auto',
        background: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: '#999' }}>
          <div style={{
            width: 32, height: 32, border: '3px solid #e8e8e8',
            borderTopColor: '#667eea', borderRadius: '50%',
            margin: '0 auto 12px', animation: 'spin 0.8s linear infinite'
          }} />
          加载订单信息...
        </div>
      </div>
    )
  }

  // ========== 订单不存在 ==========
  if (!order) {
    return (
      <div style={{
        width: 375, maxWidth: '100vw', minHeight: '100vh', margin: '0 auto',
        background: '#f8f8f8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16
      }}>
        <CloseCircleFilled style={{ fontSize: 48, color: '#ff4d4f' }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: '#333' }}>订单不存在</div>
        <div style={{ fontSize: 13, color: '#999' }}>请确认订单号是否正确</div>
        <button onClick={() => navigate('/')}
          style={{
            marginTop: 12, padding: '10px 32px', borderRadius: 20, border: 'none',
            background: '#667eea', color: '#fff', fontSize: 14, cursor: 'pointer'
          }}>返回首页</button>
      </div>
    )
  }

  // ========== 支付成功 ==========
  if (paid) {
    return (
      <div style={{
        width: 375, maxWidth: '100vw', minHeight: '100vh', margin: '0 auto',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '0 32px', animation: 'fadeIn 0.5s ease'
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(82,196,26,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20
        }}>
          <CheckCircleFilled style={{ fontSize: 44, color: '#52c41a' }} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 8 }}>支付成功 🎉</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a', marginBottom: 8 }}>
          ¥{Number(order.final_price).toFixed(2)}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 32 }}>
          订单号：{order.id}
        </div>
        <button onClick={() => navigate('/')}
          style={{
            width: '100%', maxWidth: 280, padding: '14px 0', borderRadius: 24, border: 'none',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer'
          }}>返回首页</button>
      </div>
    )
  }

  // ========== 已取消 ==========
  if (timeoutExpired) {
    return (
      <div style={{
        width: 375, maxWidth: '100vw', minHeight: '100vh', margin: '0 auto',
        background: '#f8f8f8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '0 32px'
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(255,77,79,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20
        }}>
          <CloseCircleFilled style={{ fontSize: 44, color: '#ff4d4f' }} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#333', marginBottom: 8 }}>订单已取消</div>
        <div style={{ fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
          支付时间已过，该订单已自动取消
        </div>
        <div style={{
          width: '100%', maxWidth: 280, padding: 14, borderRadius: 12,
          background: '#fff', marginBottom: 12, textAlign: 'center'
        }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>订单号</div>
          <div style={{ fontSize: 13, color: '#333', fontWeight: 500 }}>{order.id}</div>
        </div>
        <button onClick={() => navigate('/')}
          style={{
            width: '100%', maxWidth: 280, padding: '14px 0', borderRadius: 24, border: 'none',
            background: '#667eea', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer'
          }}>返回首页</button>
      </div>
    )
  }

  // ========== 主支付页面 ==========
  return (
    <div style={{
      maxWidth: 480, margin: '0 auto',
      minHeight: '100vh', background: '#f5f6fa', paddingBottom: 24,
      position: 'relative'
    }}>
      {/* ===== 顶部：倒计时条 ===== */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        padding: '48px 24px 24px', textAlign: 'center'
      }}>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8 }}>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          请在 {minutes}:{seconds} 内完成支付
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
          {minutes}<span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 2px' }}>:</span>{seconds}
        </div>
        <div style={{
          width: '100%', maxWidth: 200, height: 3, background: 'rgba(255,255,255,0.1)',
          borderRadius: 2, margin: '12px auto 0', overflow: 'hidden'
        }}>
          <div style={{
            height: '100%', borderRadius: 2, transition: 'width 1s linear',
            background: remaining < 60000 ? '#ff4d4f' : '#52c41a',
            width: `${(remaining / PAY_TIMEOUT) * 100}%`
          }} />
        </div>
      </div>

      {/* ===== 商品信息卡 ===== */}
      <div style={{
        margin: '-12px 16px 0', background: '#fff', borderRadius: 16,
        padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* 商品图片占位 */}
          <div style={{
            width: 72, height: 72, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 32
          }}>🛍</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 4 }}>
              {order.product_name || '商品'}
            </div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
              商家：{order.merchant_name || '未知'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e84343' }}>
              ¥{Number(order.final_price).toFixed(2)}
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0',
          display: 'flex', justifyContent: 'space-between', fontSize: 12
        }}>
          <div>
            <div style={{ color: '#999', marginBottom: 2 }}>订单号</div>
            <div style={{ color: '#333', fontWeight: 500 }}>{order.id}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#999', marginBottom: 2 }}>下单时间</div>
            <div style={{ color: '#333', fontWeight: 500 }}>
              {order.created_at ? new Date(order.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 支付方式 ===== */}
      <div style={{
        margin: '12px 16px 0', background: '#fff', borderRadius: 16,
        padding: '16px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 6
        }}>
          <WalletOutlined /> 选择支付方式
        </div>

        {/* 微信支付 */}
        <div onClick={() => setMethod('wechat')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', borderRadius: 12, marginBottom: 8, cursor: 'pointer',
            border: method === 'wechat' ? '2px solid #07c160' : '1px solid #f0f0f0',
            background: method === 'wechat' ? '#f0fff4' : '#fff',
            transition: 'all 0.2s'
          }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: '#07c160', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 18, flexShrink: 0
          }}>💚</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>微信支付</div>
            <div style={{ fontSize: 11, color: '#999' }}>推荐微信用户使用</div>
          </div>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            border: method === 'wechat' ? '6px solid #07c160' : '2px solid #d9d9d9',
            transition: 'all 0.2s'
          }} />
        </div>

        {/* 支付宝 */}
        <div onClick={() => setMethod('alipay')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
            border: method === 'alipay' ? '2px solid #1677ff' : '1px solid #f0f0f0',
            background: method === 'alipay' ? '#f0f5ff' : '#fff',
            transition: 'all 0.2s'
          }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: '#1677ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 18, flexShrink: 0
          }}>💙</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>支付宝</div>
            <div style={{ fontSize: 11, color: '#999' }}>支持余额宝和花呗</div>
          </div>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            border: method === 'alipay' ? '6px solid #1677ff' : '2px solid #d9d9d9',
            transition: 'all 0.2s'
          }} />
        </div>
      </div>

      {/* ===== 确认支付按钮（底部固定，品牌红色） ===== */}
      <div style={{
        padding: '20px 16px 36px'
      }}>
        <button onClick={handlePay} disabled={paying}
          style={{
            width: '100%', padding: '16px 0', borderRadius: 8, border: 'none',
            background: !method || paying
              ? 'linear-gradient(135deg, #c0c0c0, #a0a0a0)'
              : 'linear-gradient(135deg, #e84343, #d63031)',
            color: '#fff', fontSize: 17, fontWeight: 600, cursor: !method || paying ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s', opacity: paying ? 0.7 : 1, height: 56
          }}>
          {paying ? (
            <span>
              <span style={{
                display: 'inline-block', width: 16, height: 16,
                border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                borderRadius: '50%', marginRight: 8, verticalAlign: 'middle',
                animation: 'spin 0.8s linear infinite'
              }} />
              支付中...
            </span>
          ) : (
            `确认支付 ¥${Number(order.final_price).toFixed(2)}`
          )}
        </button>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => navigate(-1)}
            style={{
              background: 'none', border: 'none', color: '#999', fontSize: 12,
              cursor: 'pointer', textDecoration: 'underline'
            }}>返回</button>
        </div>
      </div>

      {/* ===== CSS 动画 ===== */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

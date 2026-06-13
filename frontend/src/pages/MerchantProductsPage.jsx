import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Row, Col, Tag, Typography, Button, message } from 'antd'
import { LogoutOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import api from '../api'
import useStore from '../store'

const { Title, Text, Paragraph } = Typography

const STATUS_CONFIG = {
  bidding:       { label: '竞拍中',   color: 'success' },
  upcoming:      { label: '即将开拍', color: 'processing' },
  ended_sold:    { label: '已成交',   color: 'success' },
  ended_pending: { label: '待支付',   color: 'warning' },
  ended_no_sale: { label: '未成交',   color: 'error' },
  cancelled:     { label: '已取消',   color: 'warning' },
  no_auction:    { label: '',         color: 'default' }
}

export default function MerchantProductsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const userInfo = useStore(s => s.userInfo)
  const logout = useStore(s => s.logout)
  const [merchant, setMerchant] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const mres = await api.get('/merchants')
      const found = mres.data.list.find(m => m.id === Number(id))
      setMerchant(found || { username: '商家', id: Number(id) })
      const pres = await api.get(`/merchants/${id}/products`)
      setProducts(pres.data.list)
    } catch (err) { message.error(err.message || '加载失败') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  const handleLogout = () => { logout(); navigate('/auth', { replace: true }) }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0', borderBottom: '1px solid #f0f0f0', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>{merchant?.username || '商家'} 的商品</Title>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Text>{userInfo?.username}</Text>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回大厅</Button>
          <Button icon={<LogoutOutlined />} danger onClick={handleLogout}>退出</Button>
        </div>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>加载中...</div>
      : products.length === 0 ? <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>暂无商品</div>
      : (
        <Row gutter={[16, 16]}>
          {products.map(p => {
            const c = STATUS_CONFIG[p.display_status] || STATUS_CONFIG.no_auction
            return (
              <Col xs={24} sm={12} md={8} key={p.id}>
                <Card hoverable onClick={() => navigate(`/products/${p.id}`)}
                  cover={p.image ? <img src={p.image} alt={p.name} style={{ height: 180, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} /> : null}>
                  <Card.Meta
                    title={p.name}
                    description={
                      <>
                        {p.description && <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 8 }}>{p.description}</Paragraph>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                          {p.current_price && <Text strong style={{ color: '#e84343', fontSize: 18 }}>¥{Number(p.current_price).toFixed(2)}</Text>}
                          {c.label && <Tag color={c.color}>{c.label}</Tag>}
                        </div>
                        {p.total_bids > 0 && <Text type="secondary" style={{ fontSize: 12 }}>{p.total_bids} 次出价</Text>}
                      </>
                    }
                  />
                </Card>
              </Col>
            )
          })}
        </Row>
      )}
    </div>
  )
}

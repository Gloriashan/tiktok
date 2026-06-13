import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Button, InputNumber, Descriptions, Typography, Tag, message, Result, Statistic, Space } from 'antd'
import { MinusOutlined, PlusOutlined, LogoutOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import api from '../api'
import useStore from '../store'

const { Title, Text } = Typography

export default function ProductDetailPage() {
  const { id: productId } = useParams()
  const navigate = useNavigate()
  const userInfo = useStore(s => s.userInfo)
  const logout = useStore(s => s.logout)
  const setCurrentPrice = useStore(s => s.setCurrentPrice)
  const isMerchant = userInfo?.role === 'merchant'

  const [product, setProduct] = useState(null)
  const [auction, setAuction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bidAmount, setBidAmount] = useState(null)
  const [bidding, setBidding] = useState(false)

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true)
      const pres = await api.get(`/products/${productId}`)
      setProduct(pres.data)

      const ares = await api.get('/auctions', { params: { product_id: Number(productId) } })
      const auctionList = ares.data.list
      if (auctionList.length > 0) {
        const dres = await api.get(`/auctions/${auctionList[0].id}`)
        setAuction(dres.data)
        const next = Number(dres.data.current_price) + Number(dres.data.bid_increment)
        setBidAmount(next)
        setCurrentPrice(Number(dres.data.current_price))
      } else {
        setAuction(null)
      }
    } catch (err) {
      message.error(err.message || '加载失败')
      if (err?.response?.status === 404) setProduct(null)
    } finally { setLoading(false) }
  }, [productId])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  // ========== 出价 ==========
  const handleBid = async () => {
    if (!auction) return
    const minBid = Number(auction.current_price) + Number(auction.bid_increment)
    const maxPrice = auction.max_price ? Number(auction.max_price) : null
    if (!bidAmount || bidAmount < minBid) { message.error(`最低出价 ¥${minBid.toFixed(2)}`); return }
    if (maxPrice && bidAmount > maxPrice) { message.error(`不能超过封顶价 ¥${maxPrice.toFixed(2)}`); return }

    setBidding(true)
    try {
      const res = await api.post(`/auctions/${auction.id}/bid`, { bid_amount: bidAmount })
      message.success(res.message)
      setCurrentPrice(bidAmount)
      await fetchDetail()
    } catch (err) { message.error(err.message || '出价失败') }
    finally { setBidding(false) }
  }

  const handlePay = () => { if (auction?.my_order) navigate(`/pay/${auction.my_order.id}`) }
  const handleLogout = () => { logout(); navigate('/auth', { replace: true }) }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>加载中...</div>
  if (!product) return (
    <div style={{ maxWidth: 500, margin: '60px auto' }}>
      <Result status="error" title="商品不存在" extra={<Button onClick={() => navigate(-1)}>返回</Button>} />
    </div>
  )

  const auctionStatus = auction?.status
  const isUpcoming = auction && auctionStatus === 'pending'
  const isBidding = auction && auctionStatus === 'active'
  const hasAuction = !!auction
  const endLabel = (() => {
    if (!auction) return ''
    if (auction.status === 'cancelled') return '已取消'
    if (auction.status !== 'ended') return ''
    // 竞拍成交后只展示两种状态：待支付 / 已成交
    if (Number(auction.total_bids || 0) > 0) {
      if (auction.order_payment_status === 'paid') return '已成交'
      if (auction.order_payment_status === 'cancelled') return '已取消'
      return '待支付' // unpaid/null
    }
    return '未成交'
  })()
  const canPay = auction?.my_order?.payment_status === 'unpaid'
  const isPaid = auction?.my_order?.payment_status === 'paid'

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0', borderBottom: '1px solid #f0f0f0', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>商品详情</Title>
        <Space>
          <Text>{userInfo?.username}</Text>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          {isMerchant && <Button onClick={() => navigate('/merchant')}>商家后台</Button>}
          <Button icon={<LogoutOutlined />} danger onClick={handleLogout}>退出</Button>
        </Space>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* 左侧：商品信息 */}
        <Card cover={product.image ? <img src={product.image} alt={product.name} style={{ height: 280, objectFit: 'contain', background: '#fafafa' }} onError={e => { e.target.style.display = 'none' }} /> : undefined}>
          <Card.Meta
            title={product.name}
            description={product.description || '暂无描述'}
          />
          <div style={{ marginTop: 12 }}>
            <Text type="secondary">商家：{product.merchant_name || '未知'} </Text>
            {hasAuction && <Tag color={auctionStatus === 'active' ? 'success' : auctionStatus === 'pending' ? 'processing' : auctionStatus === 'cancelled' ? 'warning' : endLabel === '已成交' ? 'success' : endLabel === '未成交' ? 'error' : 'default'}>{auctionStatus === 'active' ? '竞拍中' : auctionStatus === 'pending' ? '即将开拍' : endLabel}</Tag>}
          </div>
        </Card>

        {/* 右侧：状态面板 */}
        <Card>
          {!hasAuction ? (
            <Result title="该商品暂未开拍" />
          ) : isUpcoming ? (
            <>
              <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
                <Descriptions.Item label="起拍价">¥{Number(auction.starting_price).toFixed(2)}</Descriptions.Item>
                <Descriptions.Item label="加价幅度">¥{Number(auction.bid_increment).toFixed(2)}</Descriptions.Item>
                {auction.max_price && <Descriptions.Item label="封顶价">¥{Number(auction.max_price).toFixed(2)}</Descriptions.Item>}
                <Descriptions.Item label="时长">{auction.duration} 秒</Descriptions.Item>
              </Descriptions>
              <Result icon={null} title="竞拍即将开始" subTitle="敬请期待" extra={<Button type="primary" onClick={() => window.location.reload()}>去看看</Button>} />
            </>
          ) : isBidding ? (
            <>
              <Statistic title="当前最高价" value={Number(auction.current_price)} precision={2} prefix="¥" valueStyle={{ color: '#e84343', fontSize: 36 }} />
              <Descriptions column={1} size="small" style={{ margin: '16px 0' }}>
                <Descriptions.Item label="加价幅度">¥{Number(auction.bid_increment).toFixed(2)}</Descriptions.Item>
                <Descriptions.Item label="出价次数">{auction.total_bids} 次</Descriptions.Item>
                <Descriptions.Item label="我的出价">{auction.my_bid ? `¥${Number(auction.my_bid).toFixed(2)}` : '暂无出价'}</Descriptions.Item>
                {auction.max_price && <Descriptions.Item label="封顶价">¥{Number(auction.max_price).toFixed(2)}</Descriptions.Item>}
              </Descriptions>

              {!isMerchant && (
                <>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    最低出价 ¥{(Number(auction.current_price) + Number(auction.bid_increment)).toFixed(2)}
                    {auction.max_price ? `，封顶价 ¥${Number(auction.max_price).toFixed(2)}` : ''}
                  </Text>
                  <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
                    <Button icon={<MinusOutlined />} onClick={() => {
                      const min = Number(auction.current_price) + Number(auction.bid_increment)
                      if (bidAmount > min) setBidAmount(bidAmount - Number(auction.bid_increment))
                    }} />
                    <InputNumber style={{ flex: 1, textAlign: 'center' }} value={bidAmount} onChange={v => setBidAmount(v)} step={Number(auction.bid_increment)} min={Number(auction.current_price) + Number(auction.bid_increment)} max={auction.max_price || 999999999} precision={2} size="large" />
                    <Button icon={<PlusOutlined />} onClick={() => setBidAmount((bidAmount || 0) + Number(auction.bid_increment))} />
                  </Space.Compact>
                  <Button type="primary" size="large" block onClick={handleBid} loading={bidding}>
                    立即出价
                  </Button>
                </>
              )}
              {isMerchant && <Text type="secondary">商家无法参与出价</Text>}
            </>
          ) : (
            <Result
              status={isPaid ? 'success' : 'info'}
              title={endLabel}
              subTitle={`成交价 ¥${Number(auction.current_price).toFixed(2)}${auction.my_bid ? ` | 我的出价: ¥${Number(auction.my_bid).toFixed(2)}` : ''}`}
              extra={
                canPay
                  ? <Button type="primary" size="large" onClick={handlePay}>确认支付 ¥{Number(auction.my_order.final_price).toFixed(2)}</Button>
                  : <Button onClick={() => navigate(-1)}>返回</Button>
              }
            />
          )}
        </Card>
      </div>
    </div>
  )
}

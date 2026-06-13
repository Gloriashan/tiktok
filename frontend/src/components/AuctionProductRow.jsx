import { Space, Tag, Button, Typography, Tooltip, Statistic } from 'antd'
import {
  StopOutlined, SoundOutlined, OrderedListOutlined,
  ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  RightCircleOutlined, SoundFilled
} from '@ant-design/icons'

const { Text } = Typography
const { Countdown } = Statistic

// ========== 状态配置 ==========
const STATUS_CONFIG = {
  active:     { label: '竞拍中',   color: 'success',  icon: <RightCircleOutlined /> },    // 绿
  pending:    { label: '即将开拍', color: 'processing', icon: <ClockCircleOutlined /> },  // 蓝
  ended_pending: { label: '待支付', color: 'warning', icon: <CheckCircleOutlined /> },    // 橙
  ended_paid:    { label: '已成交', color: 'default', icon: <CheckCircleOutlined /> },    // 灰
  ended_none: { label: '未成交',   color: 'error',    icon: <CloseCircleOutlined /> },    // 红
  cancelled:  { label: '已取消',   color: 'default',  icon: <CloseCircleOutlined /> },    // 灰
}

/**
 * AuctionProductRow — 商家端直播商品行组件
 *
 * Props：
 *   product      {Object}   商品数据
 *   auction      {Object|null} 竞拍数据（含 id, status, starting_price, bid_increment, max_price, current_price, total_bids, end_time）
 *   orderPaymentStatus {String|null} 订单支付状态（paid/pending/cancelled...），用于 ended 状态展示
 *   isHighlighted {Boolean} 是否正在讲解中
 *   onDeactivate {Function} (productId) => void    下架回调
 *   onHighlight  {Function} (auctionId, highlighted) => void   讲解/取消讲解回调
 *   onViewOrders {Function} (auctionId, productName) => void   查看订单回调
 *   onStart      {Function} (auctionId) => void      开始竞拍回调
 *   onBidSuccess {Function} (amount) => void         WebSocket 预留
 */
export default function AuctionProductRow({
  product,
  auction,
  orderPaymentStatus = null,
  isHighlighted = false,
  onDeactivate,
  onHighlight,
  onViewOrders,
  onStart,
  onBidSuccess
}) {
  if (!product) return null

  const img = product.image
  const name = product.name || '未命名商品'
  const desc = product.description || '暂无介绍'

  // 竞拍数据
  const aStatus = auction?.status
  const isActiveOrPending = aStatus === 'active' || aStatus === 'pending'
  const startPrice = auction?.starting_price ? Number(auction.starting_price) : 0
  const bidIncrement = auction?.bid_increment ? Number(auction.bid_increment) : 0
  const maxPrice = auction?.max_price ? Number(auction.max_price) : null
  const currentPrice = auction?.current_price ? Number(auction.current_price) : startPrice
  const totalBids = auction?.total_bids || 0
  const endTime = auction?.end_time ? Number(auction.end_time) : null
  const isEndedNoBids = aStatus === 'ended' && totalBids === 0

  // 状态判断
  let statusCfg
  if (aStatus === 'active') {
    statusCfg = STATUS_CONFIG.active
  } else if (aStatus === 'pending') {
    statusCfg = STATUS_CONFIG.pending
  } else if (aStatus === 'ended') {
    // 竞拍成交后只区分两种状态：
    //  - 未支付 => 待支付
    //  - 已支付 => 已成交
    if (totalBids > 0) {
      if (orderPaymentStatus === 'paid') statusCfg = STATUS_CONFIG.ended_paid
      else if (orderPaymentStatus === 'cancelled') statusCfg = STATUS_CONFIG.cancelled
      else statusCfg = STATUS_CONFIG.ended_pending
    } else statusCfg = STATUS_CONFIG.ended_none
  } else if (aStatus === 'cancelled') {
    statusCfg = STATUS_CONFIG.cancelled
  } else {
    statusCfg = { label: '未知状态', color: 'default', icon: <CloseCircleOutlined /> }
  }

  // 动态倒计时
  const showCountdown = aStatus === 'active' && endTime && endTime > Date.now()
  const countdownValue = showCountdown ? Math.floor((endTime - Date.now()) / 1000) * 1000 : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '12px 16px', background: '#fff', borderRadius: 10,
      border: isHighlighted ? '1px solid #b7eb8f' : '1px solid #f0f0f0',
      marginBottom: 10,
      boxShadow: isHighlighted ? '0 0 0 2px rgba(82,196,26,0.1)' : 'none',
      transition: 'box-shadow 0.2s, border-color 0.2s'
    }}
    onMouseEnter={e => {
      e.currentTarget.style.boxShadow = isHighlighted
        ? '0 0 0 2px rgba(82,196,26,0.15), 0 2px 12px rgba(0,0,0,0.08)'
        : '0 2px 12px rgba(0,0,0,0.08)'
      e.currentTarget.style.borderColor = isHighlighted ? '#95de64' : '#d9d9d9'
    }}
    onMouseLeave={e => {
      e.currentTarget.style.boxShadow = isHighlighted ? '0 0 0 2px rgba(82,196,26,0.1)' : 'none'
      e.currentTarget.style.borderColor = isHighlighted ? '#b7eb8f' : '#f0f0f0'
    }}>
      {/* 左侧：商品图片 + 名称 + 介绍 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '0 0 220px' }}>
        {img ? (
          <img src={img} alt={name}
            style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: '#f5f5f5' }}
            onError={e => { e.target.style.display = 'none' }} />
        ) : (
          <div style={{
            width: 52, height: 52, borderRadius: 8,
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            flexShrink: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#fff', fontSize: 20
          }}>🛍</div>
        )}
        <div style={{ minWidth: 0 }}>
          <Text strong ellipsis={{ tooltip: name }} style={{ display: 'block', fontSize: 14, lineHeight: '20px' }}>
            {name}
            {isHighlighted && <Tag color="green" style={{ marginLeft: 4, fontSize: 10, lineHeight: '14px' }}>讲解中</Tag>}
          </Text>
          <Text type="secondary" ellipsis style={{ fontSize: 12, lineHeight: '18px' }}>{desc}</Text>
        </div>
      </div>

      {/* 中间五列数据 */}
      <div style={{ display: 'flex', flex: 1, justifyContent: 'space-around', minWidth: 0, gap: 4 }}>
        <DataCell label="起拍价"  value={`¥${startPrice.toFixed(2)}`} />
        <DataCell label="加价幅度" value={`¥${bidIncrement.toFixed(2)}`} />
        <DataCell label="封顶价"  value={maxPrice ? `¥${maxPrice.toFixed(2)}` : '无'} dim={!maxPrice} />
        <DataCell label="当前出价"
          value={isEndedNoBids ? '流拍' : `¥${Number(currentPrice).toFixed(2)}`}
          highlight={!isEndedNoBids}
          dim={isEndedNoBids} />
        <DataCell label="出价次数" value={`${totalBids} 次`} />
      </div>

      {/* 状态标签 + 倒计时 */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 80 }}>
        <Tag color={statusCfg.color} icon={statusCfg.icon}
          style={{ margin: 0, fontSize: 12, padding: '2px 8px' }}>
          {statusCfg.label}
        </Tag>
        {showCountdown && (
          <Countdown
            value={endTime}
            format="mm:ss"
            valueStyle={{
              fontSize: 11, color: '#e84343', fontWeight: 600,
              fontVariantNumeric: 'tabular-nums'
            }}
            onFinish={() => {}}
          />
        )}
      </div>

      {/* 右侧操作按钮 */}
      <div style={{ flexShrink: 0 }}>
        <Space size={4}>
          {/* 竞拍中/即将开拍 显示操作按钮 */}
          {isActiveOrPending && (
            <>
              <Tooltip title="下架商品">
                <Button size="small" danger
                  icon={<StopOutlined />}
                  onClick={() => onDeactivate?.(product.id)} />
              </Tooltip>
              <Tooltip title={isHighlighted ? '取消讲解' : '讲解商品'}>
                <Button size="small"
                  type={isHighlighted ? 'primary' : 'default'}
                  icon={isHighlighted ? <SoundFilled /> : <SoundOutlined />}
                  onClick={() => onHighlight?.(auction?.id, !isHighlighted)}
                  style={isHighlighted ? { background: '#52c41a', borderColor: '#52c41a' } : {}} />
              </Tooltip>
            </>
          )}
          {/* 开始按钮（仅 pending） */}
          {aStatus === 'pending' && (
            <Button size="small" type="primary" onClick={() => onStart?.(auction.id)}>开始</Button>
          )}
          {/* 订单详情（所有状态都显示） */}
          <Tooltip title="订单详情">
            <Button size="small"
              icon={<OrderedListOutlined />}
              onClick={() => onViewOrders?.(auction?.id, name)} />
          </Tooltip>
        </Space>
      </div>
    </div>
  )
}

/** 迷你数据单元格 */
function DataCell({ label, value, highlight, dim }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 70 }}>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', lineHeight: '16px' }}>
        {label}
      </Text>
      <Text strong style={{
        fontSize: 13, lineHeight: '20px',
        color: highlight ? '#e84343' : dim ? '#bfbfbf' : '#333'
      }}>
        {value}
      </Text>
    </div>
  )
}

// 广播新出价
const broadcastBid = (io, merchantId, data) => {
  io.to(`room_${merchantId}`).emit('bid_update', data)
}

// 广播竞拍结束
const broadcastAuctionEnd = (io, merchantId, data) => {
  io.to(`room_${merchantId}`).emit('auction_end', data)
}

// 广播讲解商品
const broadcastHighlight = (io, merchantId, data) => {
  io.to(`room_${merchantId}`).emit('highlight', data)
}

// 广播竞拍开始（含结束时间戳）
const broadcastAuctionStart = (io, merchantId, data) => {
  io.to(`room_${merchantId}`).emit('auction_start', data)
}

/**
 * 查询商家当前在播商品数并全局广播给竞拍大厅
 * @param {object} io - Socket.io 实例
 * @param {object} pool - MySQL 连接池
 * @param {number} merchantId - 商户 ID
 */
const broadcastMerchantProductCount = async (io, pool, merchantId) => {
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM auctions a
       JOIN products p ON a.product_id = p.id
       WHERE p.merchant_id = ?
       AND a.status IN ('active', 'pending')
       AND (a.session_id IS NULL OR a.session_id = (
         SELECT id FROM live_sessions
         WHERE merchant_id = ? AND status = 'live'
         ORDER BY started_at DESC LIMIT 1
       ))`,
      [merchantId, merchantId]
    )
    const count = Number(rows[0]?.cnt || 0)
    io.emit('merchant_product_count_update', {
      merchant_id: merchantId,
      live_product_count: count
    })
  } catch (err) {
    console.error('[broadcastMerchantProductCount] 失败:', err.message)
  }
}

module.exports = {
  broadcastBid,
  broadcastAuctionEnd,
  broadcastHighlight,
  broadcastAuctionStart,
  broadcastMerchantProductCount
}

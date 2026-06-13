const pool = require('../db')
const { broadcastAuctionEnd, broadcastMerchantProductCount } = require('../socket/events')

const startAuctionChecker = (io, redis) => {
  if (!io) {
    console.error('[auctionChecker] io 未提供，定时器未启动')
    return
  }

  const checkAuctions = async () => {
    try {
      const [rows] = await pool.query("SELECT * FROM auctions WHERE status = 'active'")

      for (const auction of rows) {
        const auctionId = auction.id
        let shouldEnd = false

        // 尝试从 Redis 获取 endTime
        if (redis && redis.isOpen) {
          let endTime = await redis.get(`auction:${auctionId}:endTime`)

          if (!endTime) {
            // Redis 没有记录，用数据库字段兜底（SELECT * 已包含 start_time, duration）
            if (auction.start_time) {
              endTime = new Date(auction.start_time).getTime() + Number(auction.duration) * 1000
              // 同时补存到 Redis，避免每次都计算
              await redis.set(`auction:${auctionId}:endTime`, String(endTime), { EX: 3600 })
            }
          } else {
            endTime = Number(endTime)
          }

          if (endTime && Date.now() >= Number(endTime)) {
            console.log(`[auctionChecker] 竞拍 ${auctionId} 已到期，开始结束流程`)
            shouldEnd = true
          }
        } else {
          // Redis 不可用，仅使用 MySQL 兜底
          if (auction.start_time) {
            const endTimeMs = new Date(auction.start_time).getTime() + Number(auction.duration) * 1000
            if (Date.now() >= endTimeMs) {
              console.log(`[auctionChecker] 竞拍 ${auctionId} 已到期（MySQL），开始结束流程`)
              shouldEnd = true
            }
          }
        }

        if (!shouldEnd) continue

        const conn = await pool.getConnection()
        try {
          await conn.beginTransaction()

          // 再次检查状态（防止并发）
          const [current] = await conn.query(
            "SELECT id, status FROM auctions WHERE id = ? AND status = 'active' FOR UPDATE",
            [auctionId]
          )
          if (current.length === 0) {
            await conn.rollback()
            conn.release()
            continue
          }

          // 获取最高出价者
          const [topBid] = await conn.query(
            'SELECT b.user_id, u.username, b.bid_amount FROM bids b JOIN users u ON b.user_id = u.id WHERE b.auction_id = ? ORDER BY b.bid_amount DESC LIMIT 1',
            [auctionId]
          )

          // 获取商家 ID
          const [auctionInfo] = await conn.query(
            'SELECT p.merchant_id FROM auctions a JOIN products p ON a.product_id = p.id WHERE a.id = ?',
            [auctionId]
          )
          const merchantId = auctionInfo[0]?.merchant_id

          // 更新竞拍状态
          await conn.query(
            "UPDATE auctions SET status = 'ended' WHERE id = ?",
            [auctionId]
          )

          let winnerId = null
          let winner = '无人出价'
          let finalPrice = 0

          if (topBid.length > 0) {
            winnerId = topBid[0].user_id
            winner = topBid[0].username
            finalPrice = Number(topBid[0].bid_amount)

            // 生成订单
            const [orderResult] = await conn.query(
              "INSERT INTO orders (auction_id, user_id, final_price, payment_status) VALUES (?, ?, ?, 'unpaid')",
              [auctionId, winnerId, finalPrice]
            )
            const realOrderId = orderResult.insertId

            // 在广播前把 orderId 存起来
            // WebSocket 广播竞拍结束（带真实订单ID）
            if (merchantId && io) {
              broadcastAuctionEnd(io, merchantId, {
                auction_id: auctionId,
                final_price: finalPrice,
                winner_id: winnerId,
                winner: winner,
                order_id: realOrderId
              })
              console.log(`[auctionChecker] 竞拍 ${auctionId} 已自动结束，winner: ${winner}，订单ID: ${realOrderId}`)
              io.emit('merchant_updated', { merchant_id: merchantId, live_count: -1 })
              await broadcastMerchantProductCount(io, pool, merchantId)
            }
          } else {
            // 无人出价，广播竞拍结束但无订单
            if (merchantId && io) {
              broadcastAuctionEnd(io, merchantId, {
                auction_id: auctionId,
                final_price: 0,
                winner_id: null,
                winner: '无人出价',
                order_id: null
              })
              console.log(`[auctionChecker] 竞拍 ${auctionId} 已自动结束，无人出价`)
              io.emit('merchant_updated', { merchant_id: merchantId, live_count: -1 })
              await broadcastMerchantProductCount(io, pool, merchantId)
            }
          }

          await conn.commit()
          conn.release()
        } catch (txErr) {
          await conn.rollback().catch(() => {})
          conn.release()
          console.error(`[auctionChecker] 结束竞拍 ${auctionId} 失败：`, txErr.message)
        }
      }
    } catch (err) {
      console.error('[auctionChecker] 检查出错：', err.message)
    }
  }

  setInterval(checkAuctions, 1000)
  console.log('[auctionChecker] 竞拍倒计时检查器已启动（每秒检查）')

  // ========== 订单超时自动取消（每分钟检查） ==========
  setInterval(async () => {
    try {
      const [expiredOrders] = await pool.query(
        `SELECT * FROM orders WHERE payment_status = 'unpaid'
         AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`
      )
      let cancelledCount = 0
      for (const order of expiredOrders) {
        const [result] = await pool.query(
          "UPDATE orders SET payment_status = 'cancelled' WHERE id = ?",
          [order.id]
        )
        cancelledCount += Number(result?.affectedRows || 0)
        console.log(`[auctionChecker] 订单 ${order.id} 超时未支付，已取消`)

        // 通知商家端刷新状态（让“待支付”变为“已取消”）
        try {
          if (io) {
            const [rows] = await pool.query(
              `SELECT o.id AS order_id, o.auction_id, p.merchant_id
               FROM orders o
               JOIN auctions a ON o.auction_id = a.id
               JOIN products p ON a.product_id = p.id
               WHERE o.id = ?`,
              [order.id]
            )
            if (rows.length > 0) {
              io.to(`room_${rows[0].merchant_id}`).emit('order_cancelled', {
                order_id: rows[0].order_id,
                auction_id: rows[0].auction_id
              })
            }
          }
        } catch (broadcastErr) {
          console.error('[auctionChecker] 广播订单取消失败:', broadcastErr.message)
        }
      }

      console.log('[超时取消] 已取消订单数:', cancelledCount)
    } catch (err) {
      console.error('[auctionChecker] 订单超时检查失败:', err.message)
    }
  }, 60 * 1000)
  console.log('[auctionChecker] 订单超时检查器已启动（每分钟检查）')
}

module.exports = { startAuctionChecker }

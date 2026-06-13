const express = require('express')
const pool = require('../db')
const { authenticate, authorize } = require('../middleware/auth')
const { broadcastBid, broadcastAuctionEnd, broadcastAuctionStart, broadcastHighlight, broadcastMerchantProductCount } = require('../socket/events')

const router = express.Router()

console.log('[auctions.js] 已加载，已注册的路由: POST /, POST /:id/start, POST /:id/bid, GET /:id, GET /, POST /:id/highlight, GET /highlighted/:merchantId, POST /:id/cancel')

// ============================================
// POST /api/auctions — 商家创建竞拍
// ============================================
router.post('/', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const { product_id, start_price, price_step, max_price, duration } = req.body

    // 参数校验
    if (!product_id || !start_price || !price_step || !duration) {
      return res.status(400).json({ code: 400, message: '缺少必填参数' })
    }
    if (Number(start_price) <= 0 || Number(price_step) <= 0) {
      return res.status(400).json({ code: 400, message: '起拍价和加价幅度必须大于0' })
    }
    if (Number(duration) <= 0) {
      return res.status(400).json({ code: 400, message: '拍卖时长必须大于0' })
    }
    if (max_price !== undefined && max_price !== null && Number(max_price) < Number(start_price)) {
      return res.status(400).json({ code: 400, message: '封顶价不能低于起拍价' })
    }

    // 检查商品是否存在且属于当前商家
    const [products] = await pool.query(
      'SELECT id, merchant_id, status FROM products WHERE id = ?',
      [product_id]
    )
    if (products.length === 0) {
      return res.status(404).json({ code: 404, message: '商品不存在' })
    }
    if (products[0].merchant_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只能为自己的商品创建竞拍' })
    }

    // 检查该商品是否已有未结束的竞拍
    const [existing] = await pool.query(
      "SELECT id FROM auctions WHERE product_id = ? AND status IN ('pending','active')",
      [product_id]
    )
    if (existing.length > 0) {
      return res.status(409).json({ code: 409, message: '该商品已有进行中或待开始的竞拍' })
    }

    // 查出商品名称等信息用于快照
    const [productInfo] = await pool.query(
      'SELECT name, image, description FROM products WHERE id = ?',
      [product_id]
    )
    const p = productInfo[0]

    const [result] = await pool.query(
      'INSERT INTO auctions (product_id, starting_price, bid_increment, max_price, duration, snapshot_product_name, snapshot_product_image, snapshot_product_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [product_id, start_price, price_step, max_price || null, duration, p?.name || null, p?.image || null, p?.description || null]
    )

    // 自动关联当前直播场次
    let sessionId = null
    try {
      const [sessions] = await pool.query(
        "SELECT id FROM live_sessions WHERE merchant_id = ? AND status = 'live' ORDER BY started_at DESC LIMIT 1",
        [req.user.id]
      )
      if (sessions.length > 0) {
        sessionId = sessions[0].id
        await pool.query(
          'UPDATE auctions SET session_id = ? WHERE id = ?',
          [sessionId, result.insertId]
        )
      }
    } catch (_) {
      // 静默失败，session_id 非必填
    }

    // 广播新商品给直播间用户
    try {
      const io = req.app.get('io')
      if (io && sessionId) {
        const [productRows] = await pool.query(
          'SELECT id, name, image, description FROM products WHERE id = ?',
          [product_id]
        )
        const p = productRows[0]
        io.to(`room_${req.user.id}`).emit('product_added', {
          auction_id: result.insertId,
          product_id: Number(product_id),
          session_id: Number(sessionId),
          name: p?.name || '',
          image: p?.image || null,
          description: p?.description || null,
          product_name: p?.name || '',
          product_image: p?.image || null,
          product_description: p?.description || null,
          auction_status: 'pending',
          status: 'pending',
          starting_price: Number(start_price),
          bid_increment: Number(price_step),
          max_price: max_price ? Number(max_price) : null,
          duration: Number(duration),
          current_price: Number(start_price),
          end_time: null,
          sort_order: 0
        })
      }
    } catch (broadcastErr) {
      console.error('[product_added] 广播失败:', broadcastErr.message)
    }

    // 广播更新竞拍大厅商品数
    try {
      const io = req.app.get('io')
      if (io && req.app.get) {
        await broadcastMerchantProductCount(io, pool, req.user.id)
      }
    } catch (cntErr) {
      console.error('[create] 广播商品数失败:', cntErr.message)
    }

    res.status(201).json({
      code: 201,
      message: '竞拍创建成功',
      data: { id: result.insertId, product_id, starting_price: start_price, bid_increment: price_step, max_price: max_price || null, duration, status: 'pending' }
    })
  } catch (err) {
    console.error('创建竞拍失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// POST /api/auctions/:id/start — 商家开始竞拍
// ============================================
router.post('/:id/start', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const { id } = req.params

    const [auctions] = await pool.query(
      'SELECT a.id, a.status, a.product_id, a.duration, a.session_id, p.merchant_id FROM auctions a JOIN products p ON a.product_id = p.id WHERE a.id = ?',
      [id]
    )
    if (auctions.length === 0) {
      return res.status(404).json({ code: 404, message: '竞拍不存在' })
    }

    const auction = auctions[0]

    // 检查商家身份
    if (auction.merchant_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只能操作自己的竞拍' })
    }

    // 检查状态
    if (auction.status !== 'pending') {
      return res.status(400).json({ code: 400, message: `当前状态 ${auction.status} 不允许开始` })
    }

    // 更新状态为 active，记录开始时间
    // 同时计算预计结束时间：start_time + duration 秒
    const [result] = await pool.query(
      "UPDATE auctions SET status = 'active', start_time = NOW() WHERE id = ? AND status = 'pending'",
      [id]
    )

    if (result.affectedRows === 0) {
      return res.status(400).json({ code: 400, message: '竞拍状态已变更，请刷新重试' })
    }

    // ========== 存储倒计时到 Redis + WebSocket 广播 ==========
    try {
      const redisClient = req.app.get('redis')
      const auctionId = Number(id)
      const merchantId = auction.merchant_id
      const duration = Number(auction.duration)
      const endTime = Date.now() + duration * 1000

      if (redisClient && redisClient.isOpen) {
        await redisClient.set(`auction:${auctionId}:endTime`, String(endTime), { EX: duration + 60 })
      }

      const io = req.app.get('io')
      if (io) {
        broadcastAuctionStart(io, merchantId, {
          auction_id: auctionId,
          end_time: endTime,
          session_id: auction.session_id
        })
        // 广播绝对商品数给竞拍大厅
        await broadcastMerchantProductCount(io, pool, merchantId)
      }

      // ========== 自动设为讲解商品（开始竞拍 = 自动讲解） ==========
      try {
        // 先取消该商家其他竞拍的讲解状态
        await pool.query(
          `UPDATE auctions a JOIN products p ON a.product_id = p.id
           SET a.highlighted = 0
           WHERE p.merchant_id = ? AND a.id != ? AND a.highlighted = 1`,
          [merchantId, auctionId]
        )
        // 将当前竞拍设为讲解
        await pool.query(
          'UPDATE auctions SET highlighted = 1, highlight_time = NOW() WHERE id = ?',
          [auctionId]
        )

        // 获取完整信息用于广播
        const [highlightInfo] = await pool.query(
          `SELECT a.id AS auction_id, a.starting_price, a.bid_increment,
                  p.name AS product_name, p.description, p.merchant_id,
                  p.image AS product_image
           FROM auctions a JOIN products p ON a.product_id = p.id
           WHERE a.id = ?`,
          [auctionId]
        )

        if (highlightInfo.length > 0 && io) {
          broadcastHighlight(io, merchantId, {
            ...highlightInfo[0],
            id: highlightInfo[0].auction_id,
            current_price: Number(highlightInfo[0].starting_price),
            auction_status: 'active',
            product_image: highlightInfo[0].product_image || null
          })
        }
      } catch (highlightErr) {
        console.error('[start] 自动讲解失败:', highlightErr.message)
      }
    } catch (redisErr) {
      // Redis/广播失败不影响主流程
      console.error('Redis/广播竞拍开始失败：', redisErr.message)
    }

    res.json({ code: 200, message: '竞拍已开始' })
  } catch (err) {
    console.error('开始竞拍失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// POST /api/auctions/:id/bid — 用户出价（自由出价模式）
// ============================================
router.post('/:id/bid', authenticate, async (req, res) => {
  const { id } = req.params
  const { bid_amount } = req.body
  const userId = req.user.id
  const amount = Number(bid_amount)

  // ========== 服务端出价节流（同一用户同一竞拍，1秒内不能重复出价） ==========
  const redisClient = req.app.get('redis')
  const lastBidKey = `lastBid:${userId}:${id}`
  try {
    // 使用 SET NX + EX 原子实现：
    // - key 存在 => 说明 1 秒冷却未结束
    // - key 不存在 => 写入并设置 1 秒过期，自动解除
    if (redisClient?.isOpen) {
      const ok = await redisClient.set(lastBidKey, '1', { NX: true, EX: 1 })
      if (!ok) {
        return res.status(429).json({ message: '出价太频繁，请稍候' })
      }
    }
  } catch (rateErr) {
    console.error('[bid] 限流校验失败:', rateErr.message)
  }

  // ========== Redis 分布式锁，防止同一竞拍并发出价 ==========
  const lockKey = `lock:auction:${id}`
  const lockValue = `${userId}-${Date.now()}`
  let lockAcquired = false
  try {
    if (redisClient?.isOpen) {
      const acquired = await redisClient.set(lockKey, lockValue, { NX: true, EX: 3 })
      if (acquired) {
        lockAcquired = true
      } else {
        return res.status(429).json({ message: '出价处理中，请稍后重试' })
      }
    }
  } catch (lockErr) {
    // Redis 不可用时兜底，直接放行
    console.error('[bid] Redis 锁获取失败:', lockErr.message)
  }

  const conn = await pool.getConnection()
  try {
    // 商家不能参与竞拍
    if (req.user.role === 'merchant') {
      conn.release()
      return res.status(403).json({ message: '商家不能参与竞拍' })
    }

    if (!bid_amount || amount <= 0 || !Number.isFinite(amount)) {
      conn.release()
      return res.status(400).json({ code: 400, message: '出价金额无效' })
    }

    await conn.beginTransaction()

    // 悲观锁：锁定竞拍行，防止并发
    const [auctions] = await conn.query(
      'SELECT * FROM auctions WHERE id = ? FOR UPDATE',
      [id]
    )
    if (auctions.length === 0) {
      await conn.rollback()
      conn.release()
      return res.status(404).json({ code: 404, message: '竞拍不存在' })
    }

    const auction = auctions[0]

    // 检查竞拍状态
    if (auction.status !== 'active') {
      await conn.rollback()
      conn.release()
      return res.status(400).json({ code: 400, message: `当前竞拍状态为 ${auction.status}，不允许出价` })
    }

    // 获取当前最高出价
    const [bids] = await conn.query(
      'SELECT MAX(bid_amount) AS current_max FROM bids WHERE auction_id = ?',
      [id]
    )
    const currentMax = bids[0].current_max
    const minBid = currentMax
      ? Number(currentMax) + Number(auction.bid_increment)
      : Number(auction.starting_price)

    // 校验：出价金额 >= 最低加价限制
    if (amount < minBid) {
      await conn.rollback()
      conn.release()
      const reason = currentMax
        ? '当前最高价 + 加价幅度'
        : '起拍价'
      return res.status(400).json({
        code: 400,
        message: `出价金额不能低于 ${minBid} 元（${reason}）`,
        min_bid: minBid
      })
    }

    // 校验：出价金额 <= 封顶价
    if (auction.max_price !== null && amount > Number(auction.max_price)) {
      await conn.rollback()
      conn.release()
      return res.status(400).json({
        code: 400,
        message: `出价金额不能超过封顶价 ${Number(auction.max_price)} 元`,
        max_price: Number(auction.max_price)
      })
    }

    // 插入出价记录
    const [bidResult] = await conn.query(
      'INSERT INTO bids (auction_id, user_id, bid_amount) VALUES (?, ?, ?)',
      [id, userId, amount]
    )

    // 判断是否到达封顶价
    let orderCreated = false
    let orderId = null
    if (auction.max_price !== null && amount >= Number(auction.max_price)) {
      // 触顶成交 → 结束竞拍、生成订单
      await conn.query(
        "UPDATE auctions SET status = 'ended' WHERE id = ?",
        [id]
      )
      const [orderResult] = await conn.query(
        "INSERT INTO orders (auction_id, user_id, final_price, payment_status) VALUES (?, ?, ?, 'unpaid')",
        [id, userId, amount]
      )
      orderId = orderResult.insertId
      orderCreated = true
    }

    await conn.commit()
    conn.release()

    // ========== 第二步：更新 Redis 缓存（当前价、领先者、排行榜） ==========
    try {
      await redisClient.set(`auction:${id}:currentPrice`, amount)
      await redisClient.set(`auction:${id}:leaderId`, userId)
      // 写入排行榜 ZSet（score = 出价金额，member = 用户名）
      await redisClient.zAdd(`auction:${id}:leaderboard`, { score: amount, value: req.user.username })
      // 只保留分数最高的前20条
      await redisClient.zRemRangeByRank(`auction:${id}:leaderboard`, 0, -21)
    } catch (redisErr) {
      console.error('[bid] 更新 Redis 缓存失败:', redisErr.message)
    }

    // ========== 第三步：WebSocket 广播 ==========
    try {
      // 查询该竞拍对应的商家id
      const [auctionInfo] = await pool.query(
        'SELECT a.*, p.merchant_id FROM auctions a JOIN products p ON a.product_id = p.id WHERE a.id = ?',
        [id]
      )
      if (auctionInfo.length > 0) {
        const merchantId = auctionInfo[0].merchant_id
        // 获取当前总出价次数
        const [bidCountResult] = await pool.query(
          'SELECT COUNT(*) AS total FROM bids WHERE auction_id = ?',
          [id]
        )
        const bidCount = bidCountResult[0].total
        const io = req.app.get('io')

        if (io) {
          // 读取最新前10名排行榜
          let leaderboard = []
          let participantCount = 0
          try {
            const redisClient = req.app.get('redis')
            if (redisClient && redisClient.isOpen) {
              const lbResults = await redisClient.zRangeWithScores(
                `auction:${id}:leaderboard`,
                0,
                -1
              )
              leaderboard = lbResults
                .sort((a, b) => b.score - a.score)
                .slice(0, 10)
                .map(item => ({
                  username: item.value,
                  amount: Number(item.score)
                }))
              participantCount = await redisClient.zCard(
                `auction:${id}:leaderboard`
              )
            }
          } catch (_) {}

          // 广播新出价给所有在直播间的用户（含排行榜）
          broadcastBid(io, merchantId, {
            auction_id: Number(id),
            current_price: amount,
            bid_count: bidCount,
            total_bid_count: bidCount,
            participant_count: participantCount,
            bidder: req.user.username,
            leaderboard
          })

          // 如果达到封顶价，广播竞拍结束
          if (auction.max_price !== null && amount >= Number(auction.max_price)) {
            broadcastAuctionEnd(io, merchantId, {
              auction_id: Number(id),
              final_price: amount,
              winner_id: req.user.id,
              winner: req.user.username
            })
            // 通知大厅——该商家在播商品减少
            io.emit('merchant_updated', { merchant_id: merchantId, live_count: -1 })
            await broadcastMerchantProductCount(io, pool, merchantId)
          }
        }
      }
    } catch (broadcastErr) {
      // 广播失败不影响主流程
      console.error('WebSocket 广播出价失败：', broadcastErr.message)
    }

    res.status(201).json({
      code: 201,
      message: orderCreated ? '出价成功，已达封顶价，竞拍成交！' : '出价成功',
      data: {
        bid_id: bidResult.insertId,
        bid_amount: amount,
        current_max: amount,
        order_created: orderCreated,
        order_id: orderId
      }
    })
  } catch (err) {
    await conn.rollback().catch(() => {})
    conn.release()
    console.error('出价失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  } finally {
    // 释放 Redis 分布式锁（只释放自己加的锁）
    if (lockAcquired) {
      try {
        const current = await redisClient.get(lockKey)
        if (current === lockValue) {
          await redisClient.del(lockKey)
        }
      } catch (unlockErr) {
        console.error('[bid] Redis 锁释放失败:', unlockErr.message)
      }
    }
  }
})

// ============================================
// GET /api/auctions/:id/bids — 获取出价排行榜（优先 Redis ZSet，回退 MySQL）
// ============================================
router.get('/:id/bids', authenticate, async (req, res) => {
  try {
    const auctionId = req.params.id
    const redisClient = req.app.get('redis')

    // 从 Redis ZSet 取前20名（按分数从高到低）
    if (redisClient && redisClient.isOpen) {
      // 先获取所有带分数的成员
      const allResults = await redisClient.zRangeWithScores(
        `auction:${auctionId}:leaderboard`,
        0,
        -1
      )

      if (allResults.length > 0) {
        // 手动按 score 从高到低排序，取前20
        const top20 = allResults
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)

        const bids = top20.map(item => ({
          username: item.value,
          amount: Number(item.score)
        }))

        // 获取真实出价次数（MySQL）
        const [countResult] = await pool.query(
          'SELECT COUNT(*) as total FROM bids WHERE auction_id = ?',
          [auctionId]
        )

        // 参与人数 = Redis ZSet 长度
        const participantCount = await redisClient.zCard(
          `auction:${auctionId}:leaderboard`
        )

        return res.json({
          bids,
          source: 'redis',
          total_bid_count: countResult[0].total,
          participant_count: participantCount
        })
      }
    }

    // Redis 无数据时回退到 MySQL
    const [rows] = await pool.query(
      `SELECT u.username, u.id AS user_id, b.bid_amount AS amount
       FROM bids b
       JOIN users u ON b.user_id = u.id
       WHERE b.auction_id = ?
       ORDER BY b.bid_amount DESC
       LIMIT 20`,
      [auctionId]
    )

    // MySQL 回退时也获取统计信息
    const [mysqlCountResult] = await pool.query(
      'SELECT COUNT(*) as total FROM bids WHERE auction_id = ?',
      [auctionId]
    )
    const [participantsResult] = await pool.query(
      'SELECT COUNT(DISTINCT user_id) as total FROM bids WHERE auction_id = ?',
      [auctionId]
    )

    res.json({
      bids: rows,
      source: 'mysql',
      total_bid_count: mysqlCountResult[0].total,
      participant_count: participantsResult[0].total
    })
  } catch (err) {
    console.error('[GET bids]', err.message)
    res.status(500).json({ message: '服务器错误' })
  }
})

// ============================================
// GET /api/auctions/:id — 竞拍详情（含当前用户出价和订单）
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const [auctions] = await pool.query(
      `SELECT a.*, p.name AS product_name, p.image AS product_image,
              p.description AS product_description, p.merchant_id,
              u.username AS merchant_name,
              DATE_ADD(a.start_time, INTERVAL a.duration SECOND) AS end_time
       FROM auctions a
       JOIN products p ON a.product_id = p.id
       JOIN users u ON p.merchant_id = u.id
       WHERE a.id = ?`,
      [id]
    )
    if (auctions.length === 0) {
      return res.status(404).json({ code: 404, message: '竞拍不存在' })
    }

    const auction = auctions[0]

    // 从 Redis 获取准确的结束时间（优先于 MySQL datetime）
    try {
      const redisClient = req.app.get('redis')
      if (auction.status === 'active' && redisClient && redisClient.isOpen) {
        const redisEndTime = await redisClient.get(`auction:${id}:endTime`)
        if (redisEndTime) {
          auction.end_time = Number(redisEndTime)
        }
      }
    } catch (_) {}

    // 获取当前最高出价
    const [bids] = await pool.query(
      `SELECT b.id, b.bid_amount, b.bid_time, b.user_id, u.username
       FROM bids b
       JOIN users u ON b.user_id = u.id
       WHERE b.auction_id = ?
       ORDER BY b.bid_amount DESC
       LIMIT 1`,
      [id]
    )
    const currentBid = bids.length > 0 ? bids[0] : null

    // 获取当前用户的最高出价
    const [myBids] = await pool.query(
      `SELECT MAX(bid_amount) AS my_max_bid FROM bids WHERE auction_id = ? AND user_id = ?`,
      [id, userId]
    )
    const myBid = myBids[0].my_max_bid || null

    // 获取出价总数
    const [countResult] = await pool.query(
      'SELECT COUNT(*) AS total_bids FROM bids WHERE auction_id = ?',
      [id]
    )

    // 获取该竞拍相关的订单
    const [orders] = await pool.query(
      `SELECT * FROM orders WHERE auction_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1`,
      [id, userId]
    )
    const myOrder = orders.length > 0 ? orders[0] : null

    // 获取该竞拍的最新订单（用于全局展示“待支付/已成交”）
    const [latestOrders] = await pool.query(
      `SELECT id, payment_status FROM orders WHERE auction_id = ? ORDER BY id DESC LIMIT 1`,
      [id]
    )
    const auctionOrder = latestOrders.length > 0 ? latestOrders[0] : null

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        ...auction,
        current_price: currentBid ? currentBid.bid_amount : auction.starting_price,
        current_bid_user: currentBid ? { id: currentBid.user_id, username: currentBid.username } : null,
        total_bids: countResult[0].total_bids,
        my_bid: myBid,
        my_order: myOrder,
        order_id: auctionOrder?.id || null,
        order_payment_status: auctionOrder?.payment_status || null
      }
    })
  } catch (err) {
    console.error('查询竞拍详情失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/auctions — 竞拍列表
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, product_id, page = 1, page_size = 10 } = req.query

    const conditions = []
    const params = []

    if (status) {
      conditions.push('a.status = ?')
      params.push(status)
    }
    if (product_id) {
      conditions.push('a.product_id = ?')
      params.push(Number(product_id))
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    // 总数（带 JOIN 确保只统计有关联数据的行）
    const [countResult] = await pool.query(
      `SELECT COUNT(*) AS total FROM auctions a
       JOIN products p ON a.product_id = p.id
       JOIN users u ON p.merchant_id = u.id
       ${whereClause}`,
      params
    )
    const total = countResult[0].total

    const pageNum = Math.max(1, Number(page))
    const pageSize = Math.min(50, Math.max(1, Number(page_size)))
    const offset = (pageNum - 1) * pageSize

    const [rows] = await pool.query(
      `SELECT a.*, p.name AS product_name, p.image AS product_image,
              u.username AS merchant_name,
              (SELECT MAX(b.bid_amount) FROM bids b WHERE b.auction_id = a.id) AS current_price,
              (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS total_bids
       FROM auctions a
       JOIN products p ON a.product_id = p.id
       JOIN users u ON p.merchant_id = u.id
       ${whereClause}
       ORDER BY a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        list: rows.map(r => ({
          ...r,
          current_price: r.current_price || r.starting_price
        })),
        pagination: {
          page: pageNum,
          page_size: pageSize,
          total,
          total_pages: Math.ceil(total / pageSize)
        }
      }
    })
  } catch (err) {
    console.error('查询竞拍列表失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// POST /api/auctions/:id/highlight — 商家标记/取消讲解商品
// ============================================
router.post('/:id/highlight', authenticate, authorize('merchant'), async (req, res) => {
  console.log('[highlight路由被调用] req.params.id:', req.params.id, 'req.body:', JSON.stringify(req.body))
  console.log('[highlight路由被调用] req.user:', JSON.stringify({ id: req.user.id, username: req.user.username, role: req.user.role }))
  try {
    const { id } = req.params
    const { highlighted } = req.body  // true=开始讲解, false=取消讲解

    const [auctions] = await pool.query(
      'SELECT a.id, a.product_id, p.merchant_id FROM auctions a JOIN products p ON a.product_id = p.id WHERE a.id = ?',
      [id]
    )
    if (auctions.length === 0) {
      return res.status(404).json({ code: 404, message: '竞拍不存在' })
    }
    if (auctions[0].merchant_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只能操作自己的商品' })
    }

    if (highlighted) {
      // 先取消该商家所有商品的讲解状态
      await pool.query(
        `UPDATE auctions a
         JOIN products p ON a.product_id = p.id
         SET a.highlighted = 0, a.highlight_time = NULL
         WHERE p.merchant_id = ?`,
        [req.user.id]
      )
      // 设置当前商品为讲解中
      await pool.query(
        "UPDATE auctions SET highlighted = 1, highlight_time = NOW() WHERE id = ?",
        [id]
      )

      // ========== 查询完整商品信息并广播 highlight 事件 ==========
      try {
        const [highlightInfo] = await pool.query(
          `SELECT a.id AS auction_id, a.starting_price, a.bid_increment,
                  a.max_price, a.duration, a.status AS auction_status,
                  p.name AS product_name, p.image AS product_image,
                  p.description AS product_description, p.merchant_id,
                  (SELECT MAX(b.bid_amount) FROM bids b WHERE b.auction_id = a.id) AS current_price,
                  (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS total_bids
           FROM auctions a
           JOIN products p ON a.product_id = p.id
           WHERE a.id = ?`,
          [id]
        )

        const io = req.app.get('io')
        if (highlightInfo.length > 0 && io) {
          const data = highlightInfo[0]
          broadcastHighlight(io, req.user.id, {
            auction_id: data.auction_id,
            id: data.auction_id,
            product_name: data.product_name,
            product_image: data.product_image,
            product_description: data.product_description,
            starting_price: Number(data.starting_price),
            bid_increment: Number(data.bid_increment),
            max_price: data.max_price ? Number(data.max_price) : null,
            duration: Number(data.duration),
            current_price: Number(data.current_price || data.starting_price),
            total_bids: Number(data.total_bids),
            auction_status: data.auction_status,
            merchant_id: data.merchant_id
          })
        }
      } catch (broadcastErr) {
        console.error('[highlight] 广播讲解失败:', broadcastErr.message)
      }
    } else {
      await pool.query(
        "UPDATE auctions SET highlighted = 0, highlight_time = NULL WHERE id = ?",
        [id]
      )
    }

    res.json({ code: 200, message: highlighted ? '开始讲解' : '取消讲解', data: { highlighted: !!highlighted } })
  } catch (err) {
    console.error('操作讲解状态失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/auctions/highlighted/:merchantId — 获取商家当前讲解的商品
// ============================================
router.get('/highlighted/:merchantId', authenticate, async (req, res) => {
  try {
    const merchantId = Number(req.params.merchantId)

    const [rows] = await pool.query(
      `SELECT a.*, p.name AS product_name, p.image AS product_image,
              p.description AS product_description,
              (SELECT MAX(b.bid_amount) FROM bids b WHERE b.auction_id = a.id) AS current_price,
              (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS total_bids
       FROM auctions a
       JOIN products p ON a.product_id = p.id
       WHERE p.merchant_id = ? AND a.highlighted = 1
         AND a.status IN ('pending','active')
       LIMIT 1`,
      [merchantId]
    )

    if (rows.length === 0) {
      return res.json({ code: 200, data: null, message: '当前没有讲解中的商品' })
    }

    const item = rows[0]
    item.current_price = item.current_price || item.starting_price

    res.json({ code: 200, data: item })
  } catch (err) {
    console.error('获取讲解商品失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})
// ============================================
router.post('/:id/cancel', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const { id } = req.params

    const [auctions] = await pool.query(
      'SELECT a.id, a.status, a.product_id, p.merchant_id FROM auctions a JOIN products p ON a.product_id = p.id WHERE a.id = ?',
      [id]
    )
    if (auctions.length === 0) {
      return res.status(404).json({ code: 404, message: '竞拍不存在' })
    }

    const auction = auctions[0]

    // 检查商家身份
    if (auction.merchant_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只能操作自己的竞拍' })
    }

    // 只允许取消 pending 或 active 状态的竞拍
    if (auction.status !== 'pending' && auction.status !== 'active') {
      return res.status(400).json({ code: 400, message: `当前状态 ${auction.status} 不允许取消` })
    }

    const [result] = await pool.query(
      "UPDATE auctions SET status = 'cancelled' WHERE id = ? AND status IN ('pending','active')",
      [id]
    )

    if (result.affectedRows === 0) {
      return res.status(400).json({ code: 400, message: '取消失败，请刷新重试' })
    }

    res.json({ code: 200, message: '竞拍已取消' })
  } catch (err) {
    console.error('取消竞拍失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// PUT /api/auctions/reorder — 更新待竞拍商品排序
// ============================================
router.put('/reorder', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const { ids } = req.body

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ code: 400, message: '请提供排序后的竞拍ID数组' })
    }

    // 校验所有竞拍都属于当前商家且状态为 pending
    const placeholders = ids.map(() => '?').join(',')
    const [auctions] = await pool.query(
      `SELECT a.id, a.status, p.merchant_id FROM auctions a
       JOIN products p ON a.product_id = p.id
       WHERE a.id IN (${placeholders})`,
      ids
    )
    if (auctions.length !== ids.length) {
      return res.status(404).json({ code: 404, message: '部分竞拍不存在' })
    }
    for (const a of auctions) {
      if (a.merchant_id !== req.user.id) {
        return res.status(403).json({ code: 403, message: '无权操作其他商家的竞拍' })
      }
      if (a.status !== 'pending') {
        return res.status(400).json({ code: 400, message: '只能对即将开拍的商品排序' })
      }
    }

    // 逐一更新 sort_order（从 1 开始）
    for (let i = 0; i < ids.length; i++) {
      await pool.query(
        'UPDATE auctions SET sort_order = ? WHERE id = ?',
        [i + 1, ids[i]]
      )
    }

    // 广播排序更新给当前商家的直播间用户
    try {
      const io = req.app.get('io')
      if (io) {
        // 获取当前商家的 session_id
        const [sessions] = await pool.query(
          "SELECT id FROM live_sessions WHERE merchant_id = ? AND status = 'live' LIMIT 1",
          [req.user.id]
        )
        if (sessions.length > 0) {
          const [pendingAuctions] = await pool.query(
            `SELECT a.id AS auction_id, a.sort_order
             FROM auctions a
             JOIN products p ON a.product_id = p.id
             WHERE p.merchant_id = ? AND a.session_id = ? AND a.status = 'pending'
             ORDER BY a.sort_order ASC`,
            [req.user.id, sessions[0].id]
          )
          io.emit('product_order_update', {
            merchantId: req.user.id,
            pending_auctions: pendingAuctions
          })
        }
      }
    } catch (broadcastErr) {
      console.error('[reorder] 广播失败:', broadcastErr.message)
    }

    res.json({ code: 200, message: '排序更新成功' })
  } catch (err) {
    console.error('更新排序失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

module.exports = router

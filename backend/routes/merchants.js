const express = require('express')
const pool = require('../db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

// ============================================
// POST /api/merchant/golive — 商家开播
// ============================================
router.post('/golive', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const { name } = req.body
    const merchantId = req.user.id

    await pool.query(
      'UPDATE users SET is_live = 1, live_started_at = NOW() WHERE id = ?',
      [merchantId]
    )

    // 自动生成默认名称
    let sessionName = name
    if (!sessionName || !sessionName.trim()) {
      const [cntRows] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM live_sessions WHERE merchant_id = ?',
        [merchantId]
      )
      const count = Number(cntRows[0].cnt)
      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
      sessionName = `${dateStr} 第${count + 1}场`
    }

    const [result] = await pool.query(
      'INSERT INTO live_sessions (merchant_id, name, started_at, status) VALUES (?, ?, NOW(), ?)',
      [merchantId, sessionName.trim(), 'live']
    )
    const sessionId = result.insertId

    const io = req.app.get('io')
    if (io) io.emit('merchant_live_status', { merchantId, isLive: true, username: req.user.username })
    res.json({ code: 200, message: '开播成功', session_id: sessionId })
  } catch (err) {
    console.error('开播失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// POST /api/merchant/endlive — 商家下播
// ============================================
router.post('/endlive', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const merchantId = req.user.id

    await pool.query(
      'UPDATE users SET is_live = 0 WHERE id = ?',
      [merchantId]
    )

    // 关闭当前 live 场次
    await pool.query(
      "UPDATE live_sessions SET status = 'ended', ended_at = NOW() WHERE merchant_id = ? AND status = 'live'",
      [merchantId]
    )

    const io = req.app.get('io')
    if (io) io.emit('merchant_live_status', { merchantId, isLive: false, username: req.user.username })
    res.json({ code: 200, message: '下播成功' })
  } catch (err) {
    console.error('下播失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/merchant/sessions — 历史场次列表（分页）
// ============================================
router.get('/sessions', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const merchantId = req.user.id
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10))
    const offset = (page - 1) * limit

    // 总数
    const [cntRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM live_sessions WHERE merchant_id = ? AND status = 'ended'",
      [merchantId]
    )
    const total = Number(cntRows[0].total)

    // 列表 — 含商品数和成交单数
    const [rows] = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM auctions a WHERE a.session_id = s.id) AS product_count,
              (SELECT COUNT(*) FROM orders o
               JOIN auctions a ON o.auction_id = a.id
               WHERE a.session_id = s.id AND o.payment_status = 'paid') AS sold_count
       FROM live_sessions s
       WHERE s.merchant_id = ? AND s.status = 'ended'
       ORDER BY s.started_at DESC
       LIMIT ? OFFSET ?`,
      [merchantId, limit, offset]
    )

    res.json({
      code: 200,
      data: {
        sessions: rows,
        total,
        page,
        limit
      }
    })
  } catch (err) {
    console.error('获取历史场次失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/merchant/sessions/:id — 某场次下的商品列表
// ============================================
router.get('/sessions/:id', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const merchantId = req.user.id
    const sessionId = Number(req.params.id)

    const [rows] = await pool.query(
      `SELECT p.*, u.username AS merchant_name,
              a.id AS auction_id, a.session_id, a.status AS auction_status,
              a.starting_price, a.bid_increment, a.max_price,
              a.duration, a.start_time, a.sort_order,
              DATE_ADD(a.start_time, INTERVAL a.duration SECOND) AS end_time,
              (SELECT MAX(b.bid_amount) FROM bids b WHERE b.auction_id = a.id) AS current_price,
              (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS total_bids,
              (SELECT o.id FROM orders o WHERE o.auction_id = a.id ORDER BY o.id DESC LIMIT 1) AS order_id,
              (SELECT o.payment_status FROM orders o WHERE o.auction_id = a.id ORDER BY o.id DESC LIMIT 1) AS order_payment_status
       FROM live_sessions s
       JOIN auctions a ON a.session_id = s.id
       JOIN products p ON a.product_id = p.id
       JOIN users u ON p.merchant_id = u.id
       WHERE s.id = ? AND s.merchant_id = ?
       ORDER BY a.start_time DESC`,
      [sessionId, merchantId]
    )

    const list = rows.map((r) => {
      let displayStatus = 'no_auction'
      if (r.auction_id) {
        if (r.auction_status === 'pending') displayStatus = 'upcoming'
        else if (r.auction_status === 'active') displayStatus = 'bidding'
        else if (r.auction_status === 'ended') {
          if (Number(r.total_bids || 0) > 0) {
            if (r.order_payment_status === 'paid') displayStatus = 'ended_sold'
            else if (r.order_payment_status === 'cancelled') displayStatus = 'cancelled'
            else displayStatus = 'ended_pending'
          } else {
            displayStatus = 'ended_no_sale'
          }
        }
        else if (r.auction_status === 'cancelled') displayStatus = 'cancelled'
      }
      return {
        ...r,
        display_status: displayStatus,
        current_price: r.current_price || r.starting_price
      }
    })

    res.json({ code: 200, data: { list } })
  } catch (err) {
    console.error('获取场次商品失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// PATCH /api/merchant/sessions/:id/name — 编辑场次名称
// ============================================
router.patch('/sessions/:id/name', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const merchantId = req.user.id
    const sessionId = Number(req.params.id)
    const { name } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '场次名称不能为空' })
    }

    await pool.query(
      'UPDATE live_sessions SET name = ? WHERE id = ? AND merchant_id = ?',
      [name.trim(), sessionId, merchantId]
    )

    res.json({ code: 200, message: '更新成功' })
  } catch (err) {
    console.error('更新场次名称失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/merchant/status — 获取当前开播状态和当前场次
// ============================================
router.get('/status', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT is_live, live_started_at FROM users WHERE id = ?',
      [req.user.id]
    )

    // 查询当前 live 场次
    let currentSession = null
    if (rows.length > 0 && rows[0].is_live) {
      const [sessions] = await pool.query(
        "SELECT id, name, started_at FROM live_sessions WHERE merchant_id = ? AND status = 'live' ORDER BY started_at DESC LIMIT 1",
        [req.user.id]
      )
      if (sessions.length > 0) currentSession = sessions[0]
    }

    res.json({
      code: 200,
      data: {
        isLive: rows.length > 0 ? !!rows[0].is_live : false,
        liveStartedAt: rows.length > 0 ? rows[0].live_started_at : null,
        currentSession
      }
    })
  } catch (err) {
    console.error('获取开播状态失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/merchants — 获取所有直播中商家列表
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.avatar, u.is_live, u.live_started_at, u.created_at,
              COUNT(DISTINCT a.id) AS product_count
       FROM users u
       LEFT JOIN products p ON u.id = p.merchant_id AND p.status != 'inactive'
       LEFT JOIN auctions a ON a.product_id = p.id
         AND a.id = (SELECT MAX(a2.id) FROM auctions a2 WHERE a2.product_id = p.id)
         AND a.status IN ('pending','active')
       WHERE u.role = 'merchant' AND u.is_live = 1
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    )
    res.json({ code: 200, data: { list: rows } })
  } catch (err) {
    console.error('获取商家列表失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/merchants/:id/live-status — 获取商家直播状态
// ============================================
router.get('/:id/live-status', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
    'SELECT id, username, avatar, is_live, live_started_at FROM users WHERE id = ? AND role = ?',
    [Number(req.params.id), 'merchant']
  )
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '商家不存在' })
    }
    res.json({ code: 200, data: { ...rows[0], isLive: !!rows[0].is_live } })
  } catch (err) {
    console.error('获取直播状态失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/merchants/:id/products — 获取某商家商品列表
// ============================================
router.get('/:id/products', authenticate, async (req, res) => {
  try {
    const merchantId = Number(req.params.id)
    const viewLive = req.query.view === 'live'

    let sql, params

    if (viewLive) {
      // 查询商家当前直播场次
      const [sessions] = await pool.query(
        "SELECT id FROM live_sessions WHERE merchant_id = ? AND status = 'live' LIMIT 1",
        [merchantId]
      )
      if (sessions.length === 0) {
        return res.json({ code: 200, data: { list: [] } })
      }
      const sessionId = sessions[0].id

      sql = `SELECT p.*, u.username AS merchant_name,
              a.id AS auction_id, a.session_id, a.status AS auction_status,
              a.starting_price, a.bid_increment, a.max_price,
              a.duration, a.start_time, a.sort_order,
              DATE_ADD(a.start_time, INTERVAL a.duration SECOND) AS end_time,
              (SELECT MAX(b.bid_amount) FROM bids b WHERE b.auction_id = a.id) AS current_price,
              (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS total_bids,
              (SELECT o.id FROM orders o WHERE o.auction_id = a.id ORDER BY o.id DESC LIMIT 1) AS order_id,
              (SELECT o.payment_status FROM orders o WHERE o.auction_id = a.id ORDER BY o.id DESC LIMIT 1) AS order_payment_status
       FROM products p
       JOIN users u ON p.merchant_id = u.id
       JOIN auctions a ON a.product_id = p.id
         AND a.id = (SELECT MAX(a2.id) FROM auctions a2 WHERE a2.product_id = p.id)
       WHERE p.merchant_id = ? AND p.is_archived = 0
         AND a.session_id = ?
         AND a.status != 'cancelled'
       ORDER BY
         CASE a.status
           WHEN 'active' THEN 0
           WHEN 'pending' THEN 1
           WHEN 'ended' THEN 2
           ELSE 99
         END,
         CASE WHEN a.status = 'pending' THEN a.sort_order END ASC,
         CASE WHEN a.status = 'ended' THEN DATE_ADD(a.start_time, INTERVAL a.duration SECOND) END DESC`
      params = [merchantId, sessionId]
    } else {
      sql = `SELECT p.*, u.username AS merchant_name,
              a.id AS auction_id, a.session_id, a.status AS auction_status,
              a.starting_price, a.bid_increment, a.max_price,
              a.duration, a.start_time, a.sort_order,
              DATE_ADD(a.start_time, INTERVAL a.duration SECOND) AS end_time,
              (SELECT MAX(b.bid_amount) FROM bids b WHERE b.auction_id = a.id) AS current_price,
              (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS total_bids,
              (SELECT o.id FROM orders o WHERE o.auction_id = a.id ORDER BY o.id DESC LIMIT 1) AS order_id,
              (SELECT o.payment_status FROM orders o WHERE o.auction_id = a.id ORDER BY o.id DESC LIMIT 1) AS order_payment_status
       FROM products p
       JOIN users u ON p.merchant_id = u.id
       LEFT JOIN auctions a ON a.product_id = p.id
         AND a.id = (SELECT MAX(a2.id) FROM auctions a2 WHERE a2.product_id = p.id)
       WHERE p.merchant_id = ? AND p.is_archived = 0
       ORDER BY
         CASE
           WHEN a.status = 'active' THEN 0
           WHEN a.status = 'pending' THEN 1
           WHEN a.status = 'ended' THEN 2
           ELSE 3
         END,
         CASE WHEN a.status = 'pending' THEN a.sort_order END ASC,
         p.created_at DESC`
      params = [merchantId]
    }

    const [rows] = await pool.query(sql, params)

    const list = rows.map((r) => {
      let displayStatus = 'no_auction'
      if (r.auction_id) {
        if (r.auction_status === 'pending') displayStatus = 'upcoming'
        else if (r.auction_status === 'active') displayStatus = 'bidding'
        else if (r.auction_status === 'ended') {
          if (Number(r.total_bids || 0) > 0) {
            if (r.order_payment_status === 'paid') displayStatus = 'ended_sold'
            else if (r.order_payment_status === 'cancelled') displayStatus = 'cancelled'
            else displayStatus = 'ended_pending'
          } else {
            displayStatus = 'ended_no_sale'
          }
        }
        else if (r.auction_status === 'cancelled') displayStatus = 'cancelled'
      }
      return {
        ...r,
        display_status: displayStatus,
        current_price: r.current_price || r.starting_price
      }
    })

    try {
      const redisClient = req.app.get('redis')
      for (const row of list) {
        if (row.auction_status === 'active' && row.auction_id) {
          let endTime
          if (redisClient && redisClient.isOpen) {
            endTime = await redisClient.get(`auction:${row.auction_id}:endTime`)
          }
          if (!endTime) {
            endTime = new Date(row.start_time).getTime() + Number(row.duration) * 1000
          } else {
            endTime = Number(endTime)
          }
          row.end_time = endTime
        }
      }
    } catch (redisErr) {
      console.error('[merchants] 读取 Redis endTime 失败：', redisErr.message)
    }

    res.json({ code: 200, data: { list } })
  } catch (err) {
    console.error('获取商家商品列表失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/merchants/:id/stats — 获取商家经营数据
// ============================================
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const merchantId = Number(req.params.id)

    const [rows] = await pool.query(
      `SELECT
         COALESCE(SUM(o.final_price), 0) AS total_revenue,
         COUNT(o.id) AS total_orders
       FROM orders o
       JOIN auctions a ON o.auction_id = a.id
       JOIN products p ON a.product_id = p.id
       WHERE p.merchant_id = ? AND o.payment_status = 'paid'`,
      [merchantId]
    )

    res.json({
      code: 200,
      data: {
        total_revenue: Number(rows[0].total_revenue),
        total_orders: rows[0].total_orders
      }
    })
  } catch (err) {
    console.error('获取商家经营数据失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

module.exports = router

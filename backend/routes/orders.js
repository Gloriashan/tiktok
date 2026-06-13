const express = require('express')
const pool = require('../db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

// ============================================
// POST /api/orders/:id/pay — 确认支付
// ============================================
router.post('/:id/pay', authenticate, async (req, res) => {
  try {
    const orderId = Number(req.params.id)
    const { payment_method } = req.body
    const userId = req.user.id

    if (!payment_method || !['wechat', 'alipay', 'bank'].includes(payment_method)) {
      return res.status(400).json({ code: 400, message: '请选择有效支付方式' })
    }

    // 检查订单是否属于当前用户
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [orderId, userId]
    )
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '订单不存在' })
    }
    // 兼容旧值 pending（历史数据），并兜底 null（列是后续 ALTER 加的可能为 null）
    const paymentStatus = orders[0].payment_status || 'unpaid'
    if (!['unpaid', 'pending'].includes(paymentStatus)) {
      console.error(`[orders] 支付被拒：订单 ${orderId} 当前状态为 "${paymentStatus}"，不允许支付`)
      return res.status(400).json({ code: 400, message: `订单状态不允许支付（当前状态：${paymentStatus}）` })
    }

    // 存储支付方式和状态（兼容 payment_method 列可能尚不存在的情况）
    try {
      await pool.query(
        "UPDATE orders SET payment_method = ?, payment_status = 'paid' WHERE id = ?",
        [payment_method, orderId]
      )
    } catch (updateErr) {
      // payment_method 列不存在时回退，只更新状态
      if (updateErr.message.includes('payment_method')) {
        await pool.query("UPDATE orders SET payment_status = 'paid' WHERE id = ?", [orderId])
      } else {
        throw updateErr
      }
    }

    // ========== WebSocket 广播支付成功给商家 ==========
    try {
      const [orderInfo] = await pool.query(
        `SELECT o.*, a.id AS auction_id, p.merchant_id, p.name AS product_name
         FROM orders o
         JOIN auctions a ON o.auction_id = a.id
         JOIN products p ON a.product_id = p.id
         WHERE o.id = ?`,
        [orderId]
      )
      if (orderInfo.length > 0) {
        const io = req.app.get('io')
        if (io) {
          io.to(`room_${orderInfo[0].merchant_id}`).emit('order_paid', {
            order_id: orderId,
            auction_id: orderInfo[0].auction_id,
            buyer_username: req.user.username,
            final_price: orderInfo[0].final_price,
            product_name: orderInfo[0].product_name
          })
        }
      }
    } catch (broadcastErr) {
      console.error('[orders] 广播支付成功失败:', broadcastErr.message)
    }

    res.json({ code: 200, message: '支付成功' })
  } catch (err) {
    console.error('支付失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// POST /api/orders/:id/cancel — 取消订单
// ============================================
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const orderId = Number(req.params.id)
    const userId = req.user.id

    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [orderId, userId]
    )
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '订单不存在' })
    }
    if (orders[0].payment_status === 'paid') {
      return res.status(400).json({ code: 400, message: '已支付订单无法取消' })
    }

    await pool.query(
      "UPDATE orders SET payment_status = 'cancelled' WHERE id = ?",
      [orderId]
    )

    res.json({ code: 200, message: '订单已取消' })
  } catch (err) {
    console.error('取消订单失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// POST /api/orders/:id/confirm-receipt — 买家确认签收
// ============================================
router.post('/:id/confirm-receipt', authenticate, async (req, res) => {
  try {
    const orderId = Number(req.params.id)

    // 1. 查询订单是否存在
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE id = ?',
      [orderId]
    )
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '订单不存在' })
    }

    const order = orders[0]

    // 2. 验证订单属于当前用户
    if (Number(order.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ code: 403, message: '无权操作此订单' })
    }

    // 3. 验证订单状态为已支付
    if (order.payment_status !== 'paid') {
      return res.status(400).json({
        code: 400,
        message: '只有已支付订单才能签收'
      })
    }

    // 4. 验证物流状态为已发货
    if (order.logistics_status !== '已发货') {
      return res.status(400).json({
        code: 400,
        message: `当前物流状态(${order.logistics_status})不允许签收，请确认商家已发货`
      })
    }

    // 4. 更新为已签收
    await pool.query(
      "UPDATE orders SET logistics_status = '已签收' WHERE id = ?",
      [orderId]
    )

    // 5. 广播签收通知给买家 + 商家
    try {
      const io = req.app.get('io')
      if (io) {
        const [orderRows] = await pool.query(
          `SELECT p.merchant_id FROM orders o
           JOIN auctions a ON o.auction_id = a.id
           JOIN products p ON a.product_id = p.id
           WHERE o.id = ?`,
          [orderId]
        )
        io.to(`user_${req.user.id}`).emit('order_logistics_update', {
          orderId,
          logisticsStatus: '已签收'
        })
        if (orderRows.length > 0) {
          const merchantId = orderRows[0].merchant_id
          console.log(`[签收] 已推送给商家 merchant_${merchantId}`)
          io.to(`user_${merchantId}`).emit('order_logistics_update', {
            orderId,
            logisticsStatus: '已签收'
          })
          io.to(`merchant_${merchantId}`).emit('order_logistics_update', {
            orderId,
            logisticsStatus: '已签收'
          })
          console.log(`[签收] 已推送给商家 merchant_${merchantId}`)
        }
      }
    } catch (broadcastErr) {
      console.error('[confirm-receipt] 广播失败:', broadcastErr.message)
    }

    res.json({ code: 200, message: '签收成功' })
  } catch (err) {
    console.error('签收失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// POST /api/orders/:id/ship — 商家发货
// ============================================
router.post('/:id/ship', authenticate, async (req, res) => {
  try {
    const orderId = Number(req.params.id)
    const merchantId = req.user.id

    // 分步查询，避免JOIN导致的关联问题
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId])
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '订单不存在' })
    }
    const order = orders[0]

    // 验证订单属于当前商家的商品
    const [authCheck] = await pool.query(
      `SELECT 1 FROM auctions a 
       JOIN products p ON a.product_id = p.id 
       WHERE a.id = ? AND p.merchant_id = ?`,
      [order.auction_id, merchantId]
    )
    if (authCheck.length === 0) {
      return res.status(403).json({ code: 403, message: '无权操作此订单' })
    }

    console.log('[发货] 订单详情:', { orderId, payment_status: order.payment_status, logistics_status: order.logistics_status })
    
    if (order.payment_status !== 'paid') {
      return res.status(400).json({ code: 400, message: '只有已支付订单才能发货' })
    }
    // 只禁止已签收的订单操作
    if (order.logistics_status === '已签收') {
      return res.status(400).json({ code: 400, message: '该订单已签收，不能重复发货' })
    }

    await pool.query(
      "UPDATE orders SET logistics_status = '已发货' WHERE id = ?",
      [orderId]
    )

    // 推送给买家
    try {
      const io = req.app.get('io')
      if (io && order.user_id) {
        io.to(`user_${order.user_id}`).emit('order_logistics_update', {
          orderId,
          logisticsStatus: '已发货'
        })
      }
    } catch (broadcastErr) {
      console.error('[ship] 广播失败:', broadcastErr.message)
    }

    res.json({ code: 200, message: '发货成功' })
  } catch (err) {
    console.error('[ship] 发货失败完整堆栈:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/orders — 获取当前用户的订单列表
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id

    const [rows] = await pool.query(
      `SELECT o.*, a.product_id, p.name AS product_name, p.image AS product_image,
              u.username AS merchant_name
       FROM orders o
       JOIN auctions a ON o.auction_id = a.id
       JOIN products p ON a.product_id = p.id
       JOIN users u ON p.merchant_id = u.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [userId]
    )

    res.json({ code: 200, data: { list: rows } })
  } catch (err) {
    console.error('获取订单列表失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/orders/merchant — 商家获取自己商品的订单列表
// ============================================
router.get('/merchant', authenticate, async (req, res) => {
  try {
    const merchantId = req.user.id

    const [rows] = await pool.query(
      `SELECT o.*, a.product_id, p.name AS product_name, p.image AS product_image,
              u.username AS buyer_name
       FROM orders o
       JOIN auctions a ON o.auction_id = a.id
       JOIN products p ON a.product_id = p.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE p.merchant_id = ?
       ORDER BY o.created_at DESC`,
      [merchantId]
    )

    res.json({ code: 200, data: { list: rows } })
  } catch (err) {
    console.error('获取商家订单列表失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// PUT /api/orders/:id/logistics — 商家更新物流状态
// ============================================
router.put('/:id/logistics', authenticate, async (req, res) => {
  try {
    const orderId = Number(req.params.id)
    const { logistics_status, logistics_company, tracking_number } = req.body
    const merchantId = req.user.id

    // 校验物流状态
    const validStatuses = ['未发货', '已发货', '已签收']
    if (!logistics_status || !validStatuses.includes(logistics_status)) {
      return res.status(400).json({ code: 400, message: '无效的物流状态' })
    }

    // 检查订单是否属于该商家的商品，必须已支付
    const [orders] = await pool.query(
      `SELECT o.* FROM orders o
       JOIN auctions a ON o.auction_id = a.id
       JOIN products p ON a.product_id = p.id
       WHERE o.id = ? AND p.merchant_id = ?`,
      [orderId, merchantId]
    )
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '订单不存在' })
    }
    if (orders[0].payment_status !== 'paid') {
      return res.status(400).json({ code: 400, message: '只有已支付订单才能更新物流状态' })
    }

    await pool.query(
      'UPDATE orders SET logistics_status = ?, logistics_company = ?, tracking_number = ? WHERE id = ?',
      [logistics_status, logistics_company || null, tracking_number || null, orderId]
    )

    res.json({ code: 200, message: '物流状态已更新' })
  } catch (err) {
    console.error('[orders] 更新物流状态报错:', err.message, err.stack)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/orders/my-pending — 获取当前用户待支付订单
// ============================================
router.get('/my-pending', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.final_price, o.created_at, o.payment_status,
              o.logistics_status,
              p.name AS product_name
       FROM orders o
       JOIN auctions a ON o.auction_id = a.id
       JOIN products p ON a.product_id = p.id
       WHERE o.user_id = ? AND o.payment_status IN ('unpaid','pending')
       ORDER BY o.created_at DESC`,
      [req.user.id]
    )
    // 计算每个订单的剩余支付截止时间（毫秒时间戳）
    const orders = rows.map(r => ({
      ...r,
      expire_time: new Date(r.created_at).getTime() + 15 * 60 * 1000
    }))
    res.json({ orders })
  } catch (err) {
    console.error('[orders] my-pending 失败:', err.message)
    res.status(500).json({ message: '服务器错误' })
  }
})

// ============================================
// GET /api/orders/my-orders — 获取当前用户所有订单
// ============================================
router.get('/my-orders', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.final_price, o.created_at, o.payment_status,
              o.logistics_status,
              p.name AS product_name
       FROM orders o
       JOIN auctions a ON o.auction_id = a.id
       JOIN products p ON a.product_id = p.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT 20`,
      [req.user.id]
    )
    const orders = rows.map(r => ({
      ...r,
      expire_time: new Date(r.created_at).getTime() + 15 * 60 * 1000
    }))
    res.json({ orders })
  } catch (err) {
    console.error('[orders] my-orders 失败:', err.message)
    res.status(500).json({ message: '服务器错误' })
  }
})

// ============================================
// GET /api/orders/:id — 获取订单详情
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const orderId = Number(req.params.id)
    const userId = req.user.id

    console.log('[orders] GET orderId:', req.params.id, 'userId:', userId)
    const [debugRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId])
    console.log('[orders] 查询结果:', JSON.stringify(debugRows))

    const [rows] = await pool.query(
       `SELECT o.*, a.product_id, a.start_time AS auction_start, a.duration,
               p.name AS product_name, p.description,
               u.username AS merchant_name
       FROM orders o
       JOIN auctions a ON o.auction_id = a.id
       JOIN products p ON a.product_id = p.id
       JOIN users u ON p.merchant_id = u.id
       WHERE o.id = ? AND o.user_id = ?`,
      [orderId, userId]
    )

    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '订单不存在' })
    }

    res.json({ code: 200, data: rows[0] })
  } catch (err) {
    console.error('获取订单详情失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

module.exports = router

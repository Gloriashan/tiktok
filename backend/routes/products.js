const express = require('express')
const pool = require('../db')
const { authenticate, authorize } = require('../middleware/auth')
const { broadcastMerchantProductCount } = require('../socket/events')

const router = express.Router()

// ============================================
// POST /api/products - 商品上架（仅商家）
// ============================================
router.post('/', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const { name, image, description } = req.body
    console.log('[DEBUG] POST /api/products - req.body:', JSON.stringify(req.body))
    console.log('[DEBUG] POST /api/products - req.user:', JSON.stringify({ id: req.user.id, username: req.user.username }))

    // 参数校验
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      console.log('[DEBUG] POST /api/products - 校验失败: 名称为空')
      return res.status(400).json({ code: 400, message: '商品名称不能为空' })
    }
    if (name.length > 100) {
      return res.status(400).json({ code: 400, message: '商品名称不能超过100个字符' })
    }

    // 插入商品（默认状态为 active 已上架，无需审核）
    const [result] = await pool.query(
      "INSERT INTO products (name, image, description, merchant_id, status) VALUES (?, ?, ?, ?, 'active')",
      [name.trim(), image || null, description || null, req.user.id]
    )
    console.log('[DEBUG] POST /api/products - 插入成功, insertId:', result.insertId)

    res.status(201).json({
      code: 201,
      message: '商品上架成功',
      data: {
        id: result.insertId,
        name: name.trim(),
        image: image || null,
        description: description || null,
        merchant_id: req.user.id,
        status: 'active'
      }
    })
  } catch (err) {
    console.error('[DEBUG] POST /api/products - 异常:', err.message)
    console.error('[DEBUG] POST /api/products - 堆栈:', err.stack)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/products - 商品列表查询
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, merchant_id, page = 1, page_size = 10 } = req.query

    // 构建查询条件
    const conditions = []
    const params = []

    if (status) {
      conditions.push('p.status = ?')
      params.push(status)
    }
    if (merchant_id) {
      conditions.push('p.merchant_id = ?')
      params.push(Number(merchant_id))
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    // 查询总数
    const [countResult] = await pool.query(
      `SELECT COUNT(*) AS total FROM products p ${whereClause}`,
      params
    )
    const total = countResult[0].total

    // 分页参数
    const pageNum = Math.max(1, Number(page))
    const pageSize = Math.min(50, Math.max(1, Number(page_size)))
    const offset = (pageNum - 1) * pageSize

    // 查询列表（关联商家用户名）
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.image, p.description, p.merchant_id,
              u.username AS merchant_name, p.status, p.created_at
       FROM products p
       LEFT JOIN users u ON p.merchant_id = u.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        list: rows,
        pagination: {
          page: pageNum,
          page_size: pageSize,
          total,
          total_pages: Math.ceil(total / pageSize)
        }
      }
    })
  } catch (err) {
    console.error('商品列表查询失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/products/:id - 商品详情
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const productId = Number(id)

    console.log('[Products] GET /:id 查询商品ID:', productId, '类型:', typeof productId)

    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.image, p.description, p.merchant_id,
              u.username AS merchant_name, p.status, p.created_at
       FROM products p
       LEFT JOIN users u ON p.merchant_id = u.id
       WHERE p.id = ?`,
      [productId]
    )

    console.log('[Products] 查询结果行数:', rows.length)

    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '商品不存在' })
    }

    res.json({
      code: 200,
      message: '查询成功',
      data: rows[0]
    })
  } catch (err) {
    console.error('[Products] 商品详情查询失败:', err.message)
    console.error('[Products] 错误堆栈:', err.stack)
    res.status(500).json({ code: 500, message: '服务器内部错误: ' + err.message })
  }
})

// ============================================
// POST /api/products/:id/deactivate — 商家下架商品
// 将原商品标记为归档（只读历史），自动创建一份全新草稿副本
// ============================================
router.post('/:id/deactivate', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const productId = Number(req.params.id)

    const [products] = await pool.query(
      'SELECT * FROM products WHERE id = ?',
      [productId]
    )
    if (products.length === 0) {
      return res.status(404).json({ code: 404, message: '商品不存在' })
    }
    if (products[0].merchant_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只能下架自己的商品' })
    }

    // 取消该商品正在进行的竞拍
    await pool.query(
      "UPDATE auctions SET status = 'cancelled' WHERE product_id = ? AND status IN ('pending','active')",
      [productId]
    )
    console.log('[deactivate] 竞拍已取消 productId:', productId)

    // 查出该商品关联的竞拍（用于广播给直播间）
    const [auctionRows] = await pool.query(
      'SELECT id FROM auctions WHERE product_id = ? ORDER BY id DESC LIMIT 1',
      [productId]
    )
    const auctionId = auctionRows[0]?.id

    // 将原商品标记为归档（只读历史，不出现在待上架列表中）
    await pool.query(
      'UPDATE products SET is_archived = 1 WHERE id = ?',
      [productId]
    )
    console.log('[deactivate] 原商品已归档 productId:', productId)

    // 自动创建一份全新草稿副本（复制基本商品信息）
    const orig = products[0]
    const [result] = await pool.query(
      "INSERT INTO products (merchant_id, name, image, description, status) VALUES (?, ?, ?, ?, 'pending')",
      [req.user.id, orig.name, orig.image, orig.description]
    )
    console.log('[deactivate] 已创建草稿副本, newId:', result.insertId)

    // WebSocket 广播—通知直播间移除该商品 + 竞拍大厅更新在播商品数
    try {
      const io = req.app.get('io')
      const merchantId = req.user.id
      if (io && auctionId) {
        io.to(`room_${merchantId}`).emit('product_unlisted', {
          auction_id: auctionId,
          product_id: productId
        })
        console.log('[deactivate] 已广播 product_unlisted 到直播间')
      }
      if (io) {
        await broadcastMerchantProductCount(io, pool, merchantId)
      }
    } catch (broadcastErr) {
      console.error('[deactivate] 广播失败:', broadcastErr.message)
    }

    res.json({
      code: 200,
      message: '下架成功，已创建草稿副本',
      data: { new_product_id: result.insertId }
    })
  } catch (err) {
    console.error('下架商品失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// DELETE /api/products/:id — 删除商品（草稿或无历史的新商品可删除，已归档的不行）
// ============================================
router.delete('/:id', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const productId = Number(req.params.id)

    // 检查商品是否存在且属于当前商家
    const [products] = await pool.query(
      'SELECT * FROM products WHERE id = ?',
      [productId]
    )
    if (products.length === 0) {
      return res.status(404).json({ code: 404, message: '商品不存在' })
    }
    if (products[0].merchant_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只能删除自己的商品' })
    }

    // 已归档的商品（历史记录）不允许删除
    if (products[0].is_archived === 1) {
      return res.status(403).json({ code: 403, message: '历史记录不可删除' })
    }

    // 草稿商品/无历史的新商品可以安全删除（没有关联的 auctions 记录）
    await pool.query('DELETE FROM products WHERE id = ?', [productId])

    res.json({ code: 200, message: '商品已删除' })
  } catch (err) {
    console.error('删除商品失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// PUT /api/products/:id — 更新商品信息
// ============================================
router.put('/:id', authenticate, authorize('merchant'), async (req, res) => {
  try {
    const productId = Number(req.params.id)
    const { name, image, description } = req.body

    const [products] = await pool.query(
      'SELECT merchant_id FROM products WHERE id = ?',
      [productId]
    )
    if (products.length === 0) {
      return res.status(404).json({ code: 404, message: '商品不存在' })
    }
    if (products[0].merchant_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只能编辑自己的商品' })
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ code: 400, message: '商品名称不能为空' })
    }

    await pool.query(
      'UPDATE products SET name = ?, image = ?, description = ? WHERE id = ?',
      [name.trim(), image || null, description || null, productId]
    )

    res.json({ code: 200, message: '商品已更新' })
  } catch (err) {
    console.error('更新商品失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

module.exports = router

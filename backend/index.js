const express = require('express')
const http = require('http')
const path = require('path')
const { Server } = require('socket.io')
const cors = require('cors')
const redis = require('redis')
require('dotenv').config()
const logger = require('./utils/logger')

console.log = (...args) => logger.info(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '))
console.error = (...args) => logger.error(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '))

// 引入路由模块
const authRoutes = require('./routes/auth')
const productRoutes = require('./routes/products')
const auctionRoutes = require('./routes/auctions')
const merchantRoutes = require('./routes/merchants')
const orderRoutes = require('./routes/orders')
const uploadRoutes = require('./routes/upload')
const { startAuctionChecker } = require('./jobs/auctionChecker')
const { recoverRedisData } = require('./jobs/redisRecovery')
const pool = require('./db')

const app = express()
const PORT = process.env.PORT || 3000

// 创建 HTTP 服务器，将 Socket.io 与 Express 结合
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: /^http:\/\/localhost:\d+$/,
    methods: ['GET', 'POST']
  }
})

// 中间件
app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// 连接 Redis
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379
  }
})

redisClient.connect().then(() => {
  console.log('Redis 连接成功 ✅')
}).catch((err) => {
  console.log('Redis 连接失败：', err.message)
})

// ========== 在线人数追踪（用 Set 记录每个直播间的 socket id） ==========
const roomSockets = new Map() // key: merchantId, value: Set of socket.id

// 广播指定直播间的实时在线人数
const broadcastViewerCount = (io, merchantId) => {
  const count = roomSockets.get(String(merchantId))?.size || 0
  io.to(`room_${merchantId}`).emit('viewer_count_update', {
    merchant_id: Number(merchantId),
    viewer_count: count
  })
}

// ========== Socket.io 连接管理 ==========
io.on('connection', (socket) => {
  console.log('用户连接:', socket.id)

  // 用户登录后加入专属房间
  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`)
    console.log(`用户 ${userId} 加入专属房间 user_${userId}`)
  })

  // 商家登录后加入商家专属房间
  socket.on('join_merchant_room', (merchantId) => {
    socket.join(`merchant_${merchantId}`)
    console.log(`[WS] 商家 ${merchantId} 加入房间 merchant_${merchantId}`)
  })

  // 加入直播间
  socket.on('join_room', async (merchantId) => {
    socket.join(`room_${merchantId}`)
    console.log(`用户 ${socket.id} 加入直播间 ${merchantId}`)

    // 记录用户到该直播间的在线集合
    const key = String(merchantId)
    if (!roomSockets.has(key)) {
      roomSockets.set(key, new Set())
    }
    roomSockets.get(key).add(socket.id)

    // 实时广播更新在线人数
    broadcastViewerCount(io, merchantId)

    // 重连恢复：把当前所有 active 竞拍的状态推给刚加入的用户
    try {
      const [sessions] = await pool.query(
        "SELECT id FROM live_sessions WHERE merchant_id = ? AND status = 'live' LIMIT 1",
        [merchantId]
      )
      if (sessions.length > 0) {
        const sessionId = sessions[0].id
        const [auctions] = await pool.query(
          `SELECT a.*, p.merchant_id FROM auctions a
           JOIN products p ON a.product_id = p.id
           WHERE p.merchant_id = ? AND a.session_id = ? AND a.status = 'active'`,
          [merchantId, sessionId]
        )
        for (const auction of auctions) {
          const endTime = await redisClient.get(`auction:${auction.id}:endTime`)
          const currentPrice = await redisClient.get(`auction:${auction.id}:currentPrice`)
          socket.emit('auction_sync', {
            auction_id: auction.id,
            end_time: endTime ? Number(endTime) : null,
            current_price: currentPrice ? Number(currentPrice) : Number(auction.starting_price)
          })
        }
      }
    } catch (err) {
      console.error('[join_room] 恢复状态失败:', err.message)
    }
  })

  // 心跳保活
  socket.on('ping', () => {
    socket.emit('pong')
  })

  // 离开直播间
  socket.on('leave_room', (merchantId) => {
    const key = String(merchantId)
    if (roomSockets.has(key)) {
      roomSockets.get(key).delete(socket.id)
      // 如果集合空了，可以清掉 Map 节省内存
      if (roomSockets.get(key).size === 0) {
        roomSockets.delete(key)
      }
      broadcastViewerCount(io, merchantId)
    }
    socket.leave(`room_${merchantId}`)
    console.log(`用户 ${socket.id} 离开直播间 ${merchantId}`)
  })

  // 用户断开连接：从所有在线集合中移除该 socket.id
  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id)
    // 遍历所有直播间，移除该 socket.id
    for (const [merchantId, socketSet] of roomSockets.entries()) {
      if (socketSet.has(socket.id)) {
        socketSet.delete(socket.id)
        broadcastViewerCount(io, merchantId)
      }
    }
    // 清理空集合
    for (const [merchantId, socketSet] of roomSockets.entries()) {
      if (socketSet.size === 0) {
        roomSockets.delete(merchantId)
      }
    }
  })
})

// 将 io 实例和 redis 客户端挂载到 app 上，方便路由文件调用
app.set('io', io)
app.set('redis', redisClient)

// ========== 路由注册 ==========

// 认证相关（注册、登录）
app.use('/api/auth', authRoutes)

// 商品相关（上架、列表查询）
app.use('/api/products', productRoutes)

// 竞拍相关（创建、开始、出价、详情、列表、取消）
app.use('/api/auctions', auctionRoutes)

// 商家相关（商家列表、商家商品、经营数据）
app.use('/api/merchants', merchantRoutes)

// 订单相关（支付、取消、列表）
app.use('/api/orders', orderRoutes)
app.use('/api/upload', uploadRoutes)

// ========== 测试接口 ==========
app.get('/', (req, res) => {
  res.json({ message: 'Hello World，直播竞拍系统后端跑起来了！' })
})

// 测试路由：确认后端能收到请求
app.post('/api/test', (req, res) => {
  console.log('[TEST] 测试路由被调用, body:', JSON.stringify(req.body))
  res.json({ ok: true })
})

// ========== 启动服务器 ==========
server.listen(PORT, async () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)

  // 从 MySQL 恢复 Redis 缓存（重启后倒计时、当前价格等）
  await recoverRedisData(pool, redisClient)

  // 启动竞拍倒计时检查器
  startAuctionChecker(io, redisClient)

  // 启动时修复历史数据：将 inactive 的商品恢复为 pending
  try {
    const [result] = await pool.query("UPDATE products SET status = 'pending' WHERE status = 'inactive'")
    if (result.affectedRows > 0) {
      console.log('[startup] 已修复', result.affectedRows, '个 inactive 商品为 pending')
    }
  } catch (err) {
    console.error('[startup] 修复 inactive 商品失败:', err.message)
  }
})

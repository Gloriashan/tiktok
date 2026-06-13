const mysql = require('mysql2/promise')
require('dotenv').config()

// 创建数据库连接池（推荐生产环境使用连接池）
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'vibecoding',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

// 测试连接
pool.getConnection()
  .then(conn => {
    console.log('MySQL 连接成功 ✅')
    conn.release()
  })
  .catch(err => {
    console.log('MySQL 连接失败：', err.message)
  })

module.exports = pool

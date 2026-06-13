/**
 * 订单表列迁移：补充 payment_method / logistics_status 等列
 * 运行方式：node migrate_orders_columns.js
 */
const mysql = require('mysql2/promise')
require('dotenv').config()

const MIGRATIONS = [
  "ALTER TABLE orders ADD COLUMN payment_method ENUM('wechat','alipay','bank') DEFAULT NULL COMMENT '支付方式' AFTER final_price",
  "ALTER TABLE orders ADD COLUMN logistics_status ENUM('pending','shipped','delivered') NOT NULL DEFAULT 'pending' COMMENT '物流状态' AFTER payment_status",
  "ALTER TABLE orders ADD COLUMN logistics_company VARCHAR(50) DEFAULT NULL COMMENT '物流公司' AFTER logistics_status",
  "ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(100) DEFAULT NULL COMMENT '物流单号' AFTER logistics_company",
  // 如果 payment_status 不是 ENUM，改为 ENUM
  "ALTER TABLE orders MODIFY COLUMN payment_status ENUM('unpaid','paid','cancelled') NOT NULL DEFAULT 'unpaid' COMMENT '支付状态'"
]

;(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vibecoding',
    multipleStatements: true
  })

  console.log('=== 开始迁移 orders 表 ===')
  let ok = 0, skipped = 0
  for (const sql of MIGRATIONS) {
    try {
      await conn.query(sql)
      console.log('✓', sql.substring(0, 80) + '...')
      ok++
    } catch (e) {
      if (e.message.includes('Duplicate column') || e.message.includes('already exists')) {
        console.log('⊙ 已存在，跳过:', sql.substring(0, 60) + '...')
        skipped++
      } else {
        console.error('✗ 失败:', e.message.substring(0, 120))
      }
    }
  }

  console.log(`\n迁移完成：成功 ${ok}，跳过 ${skipped}`)
  console.log('\n=== 当前表结构 ===')
  const [desc] = await conn.query('DESCRIBE orders')
  console.table(desc)

  await conn.end()
})()

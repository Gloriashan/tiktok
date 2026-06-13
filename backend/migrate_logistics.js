const mysql = require('mysql2/promise')
require('dotenv').config()

;(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vibecoding'
  })

  // Step 1: Change ENUM to VARCHAR for flexibility with Chinese values
  try {
    await conn.query("ALTER TABLE orders MODIFY COLUMN logistics_status VARCHAR(20) NOT NULL DEFAULT '未发货' COMMENT '物流状态：未发货/已发货/已签收'")
    console.log('✓ logistics_status 改为 VARCHAR(20)')
  } catch (e) {
    console.log('⊙ 列已存在或跳过:', e.message.substring(0, 80))
  }

  // Step 2: Migrate existing data
  await conn.query("UPDATE orders SET logistics_status = '未发货' WHERE logistics_status IN ('pending', '') OR logistics_status IS NULL")
  await conn.query("UPDATE orders SET logistics_status = '已发货' WHERE logistics_status = 'shipped'")
  await conn.query("UPDATE orders SET logistics_status = '已签收' WHERE logistics_status = 'delivered'")
  console.log('✓ 已有数据迁移完成')

  // Verify
  const [rows] = await conn.query('SELECT DISTINCT logistics_status, COUNT(*) AS cnt FROM orders GROUP BY logistics_status')
  console.log('\n当前物流状态分布:')
  rows.forEach(r => console.log(`  ${r.logistics_status}: ${r.cnt} 条`))

  await conn.end()
})()

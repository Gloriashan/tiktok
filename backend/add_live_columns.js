const mysql = require('mysql2/promise')
require('dotenv').config()

;(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vibecoding'
  })

  const sqls = [
    "ALTER TABLE users ADD COLUMN is_live TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否正在直播'",
    "ALTER TABLE users ADD COLUMN live_started_at TIMESTAMP NULL DEFAULT NULL COMMENT '开播时间'"
  ]
  for (const sql of sqls) {
    try {
      await conn.query(sql)
      console.log('✓', sql.substring(0, 80))
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log('⊙ 已存在，跳过:', sql.substring(0, 50))
      } else {
        console.error('✗', e.message.substring(0, 120))
      }
    }
  }

  console.log('\n=== 验证 DESCRIBE users 字段 ===')
  const [rows] = await conn.query('DESCRIBE users')
  rows.filter(r => r.Field === 'is_live' || r.Field === 'live_started_at').forEach(r => {
    console.log(`${r.Field}: ${r.Type} (${r.Null === 'NO' ? 'NOT NULL' : 'NULL'}, Default: ${r.Default})`)
  })

  await conn.end()
})()

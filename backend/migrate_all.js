const mysql = require('mysql2/promise')
require('dotenv').config()

async function migrateAll() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vibecoding',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  })

  const conn = await pool.getConnection()

  console.log('开始补全所有缺失字段...\n')

  const migrations = [
    { table: 'users', field: 'is_live', sql: "ALTER TABLE users ADD COLUMN is_live TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否正在直播'" },
    { table: 'users', field: 'live_started_at', sql: "ALTER TABLE users ADD COLUMN live_started_at TIMESTAMP NULL DEFAULT NULL COMMENT '开播时间'" },
    { table: 'products', field: 'is_archived', sql: "ALTER TABLE products ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已归档'" },
    { table: 'auctions', field: 'snapshot_product_name', sql: "ALTER TABLE auctions ADD COLUMN snapshot_product_name VARCHAR(100) NULL COMMENT '商品名称快照'" },
    { table: 'auctions', field: 'snapshot_product_image', sql: "ALTER TABLE auctions ADD COLUMN snapshot_product_image VARCHAR(255) NULL COMMENT '商品图片快照'" },
    { table: 'auctions', field: 'snapshot_product_description', sql: "ALTER TABLE auctions ADD COLUMN snapshot_product_description TEXT NULL COMMENT '商品描述快照'" }
  ]

  for (const m of migrations) {
    const [cols] = await conn.query(`SHOW COLUMNS FROM ${m.table} LIKE ?`, [m.field])
    if (cols.length === 0) {
      await conn.query(m.sql)
      console.log(`✅ 已添加 ${m.table}.${m.field}`)
    } else {
      console.log(`ℹ️ ${m.table}.${m.field} 已存在`)
    }
  }

  console.log('\n🎉 所有字段补全完成！')

  conn.release()
  await pool.end()
}

migrateAll()

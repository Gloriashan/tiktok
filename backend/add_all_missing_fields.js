const mysql = require('mysql2/promise')
require('dotenv').config()

async function addAllMissingFields() {
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

  try {
    const checks = [
      {
        table: 'products',
        field: 'is_archived',
        sql: "ALTER TABLE products ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已归档'"
      },
      {
        table: 'auctions',
        field: 'snapshot_product_name',
        sql: "ALTER TABLE auctions ADD COLUMN snapshot_product_name VARCHAR(100) NULL COMMENT '商品名称快照'"
      },
      {
        table: 'auctions',
        field: 'snapshot_product_image',
        sql: "ALTER TABLE auctions ADD COLUMN snapshot_product_image VARCHAR(255) NULL COMMENT '商品图片快照'"
      },
      {
        table: 'auctions',
        field: 'snapshot_product_description',
        sql: "ALTER TABLE auctions ADD COLUMN snapshot_product_description TEXT NULL COMMENT '商品描述快照'"
      }
    ]

    for (const item of checks) {
      const [columns] = await conn.query(
        `SHOW COLUMNS FROM ${item.table} LIKE ?`,
        [item.field]
      )
      if (columns.length === 0) {
        await conn.query(item.sql)
        console.log(`✅ ${item.table}.${item.field} 字段添加成功`)
      } else {
        console.log(`ℹ️ ${item.table}.${item.field} 字段已存在，跳过`)
      }
    }

    console.log('\n🎉 所有缺失字段添加完成')
  } catch (err) {
    console.error('❌ 添加字段失败:', err.message)
  } finally {
    conn.release()
    await pool.end()
  }
}

addAllMissingFields()

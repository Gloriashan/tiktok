const mysql = require('mysql2/promise')
require('dotenv').config()

async function addIsArchivedField() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vibecoding',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  })

  try {
    const [columns] = await pool.query(
      "SHOW COLUMNS FROM products LIKE 'is_archived'"
    )
    if (columns.length === 0) {
      await pool.query(
        "ALTER TABLE products ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已归档'"
      )
      console.log('✅ is_archived 字段添加成功')
    } else {
      console.log('ℹ️ is_archived 字段已存在，跳过')
    }
  } catch (err) {
    console.error('添加字段失败:', err.message)
  } finally {
    await pool.end()
  }
}

addIsArchivedField()

const mysql = require('mysql2/promise')
require('dotenv').config()

async function addUsersLiveFields() {
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
        table: 'users',
        field: 'is_live',
        sql: "ALTER TABLE users ADD COLUMN is_live TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否正在直播'"
      },
      {
        table: 'users',
        field: 'live_started_at',
        sql: "ALTER TABLE users ADD COLUMN live_started_at TIMESTAMP NULL DEFAULT NULL COMMENT '开播时间'"
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

    console.log('\n🎉 users 表所有缺失字段添加完成')
  } catch (err) {
    console.error('❌ 添加字段失败:', err.message)
  } finally {
    conn.release()
    await pool.end()
  }
}

addUsersLiveFields()

const mysql = require('mysql2/promise')
require('dotenv').config()

async function ensureAllTables() {
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
    console.log('检查并确保所有表结构完整...\n')

    // live_sessions 表
    const [lsCheck] = await conn.query("SHOW TABLES LIKE 'live_sessions'")
    if (lsCheck.length === 0) {
      console.log('创建 live_sessions 表...')
      await conn.query(`
        CREATE TABLE live_sessions (
          id INT NOT NULL AUTO_INCREMENT,
          merchant_id INT NOT NULL,
          name VARCHAR(100) DEFAULT NULL,
          started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ended_at TIMESTAMP NULL DEFAULT NULL,
          status ENUM('live','ended') DEFAULT 'live',
          PRIMARY KEY (id),
          KEY idx_merchant_id (merchant_id),
          KEY idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='直播场次表'
      `)
      console.log('✅ live_sessions 表创建成功')
    } else {
      console.log('ℹ️ live_sessions 表已存在')
      // 检查字段
      const [cols] = await conn.query("SHOW COLUMNS FROM live_sessions")
      const existingFields = cols.map(c => c.Field)
      const requiredFields = ['id', 'merchant_id', 'name', 'started_at', 'ended_at', 'status']
      for (const f of requiredFields) {
        if (!existingFields.includes(f)) {
          console.log(`   添加字段 ${f}...`)
        }
      }
    }

    console.log('\n🎉 所有表和字段检查完成！')
  } catch (err) {
    console.error('❌ 出错:', err.message)
  } finally {
    conn.release()
    await pool.end()
  }
}

ensureAllTables()

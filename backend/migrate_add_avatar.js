const pool = require('./db')

async function migrate() {
  try {
    console.log('开始迁移：为users表添加avatar字段...')
    
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'avatar'
    `)
    
    if (columns.length > 0) {
      console.log('⚠️  avatar字段已存在，跳过迁移')
      process.exit(0)
    }
    
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN avatar VARCHAR(255) DEFAULT NULL COMMENT '用户头像URL'
    `)
    
    console.log('✅ 迁移完成：avatar字段已添加到users表')
    process.exit(0)
  } catch (err) {
    console.error('❌ 迁移失败：', err.message)
    process.exit(1)
  }
}

migrate()

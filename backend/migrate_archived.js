const mysql = require('mysql2/promise');
require('dotenv').config()

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'vibecoding',
  waitForConnections: true,
  connectionLimit: 2
});

(async () => {
  try {
    await pool.query("ALTER TABLE products ADD COLUMN is_archived TINYINT(1) DEFAULT 0 COMMENT '是否已归档（下架后的历史记录）'");
    console.log('[OK] is_archived column added to products');
  } catch(e) { console.log('[skip] is_archived:', e.message); }
  pool.end();
  process.exit(0);
})();

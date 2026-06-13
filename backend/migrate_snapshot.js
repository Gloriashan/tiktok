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
    await pool.query("ALTER TABLE auctions ADD COLUMN snapshot_product_name VARCHAR(255) NULL AFTER sort_order");
    console.log('[OK] snapshot_product_name added');
  } catch(e) { console.log('[skip] snapshot_product_name:', e.message); }

  try {
    await pool.query("ALTER TABLE auctions ADD COLUMN snapshot_product_image VARCHAR(500) NULL AFTER snapshot_product_name");
    console.log('[OK] snapshot_product_image added');
  } catch(e) { console.log('[skip] snapshot_product_image:', e.message); }

  try {
    await pool.query("ALTER TABLE auctions ADD COLUMN snapshot_product_description TEXT NULL AFTER snapshot_product_image");
    console.log('[OK] snapshot_product_description added');
  } catch(e) { console.log('[skip] snapshot_product_description:', e.message); }

  pool.end();
  process.exit(0);
})();

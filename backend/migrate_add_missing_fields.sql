-- 添加缺失的字段，用于已初始化的数据库
USE vibecoding;

-- 商品表添加 is_archived 字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_archived TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已归档';

-- 竞拍表添加快照字段
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS snapshot_product_name VARCHAR(100) NULL COMMENT '商品名称快照';
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS snapshot_product_image VARCHAR(255) NULL COMMENT '商品图片快照';
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS snapshot_product_description TEXT NULL COMMENT '商品描述快照';

-- 确保 bids 表有必要的索引
CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_user_id ON bids(user_id);

-- ============================================
-- 直播竞拍系统 - 数据库初始化脚本
-- ============================================

-- 创建数据库（如果尚未创建）
CREATE DATABASE IF NOT EXISTS vibecoding DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE vibecoding;

-- ----------------------------
-- 1. 用户表
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id`          INT             NOT NULL AUTO_INCREMENT  COMMENT '用户ID',
  `username`    VARCHAR(50)     NOT NULL                 COMMENT '用户名',
  `password`    VARCHAR(255)    NOT NULL                 COMMENT '密码（bcrypt加密）',
  `role`        ENUM('merchant','user') NOT NULL DEFAULT 'user' COMMENT '角色：merchant=商家, user=普通用户',
  `is_live`     TINYINT(1)      NOT NULL DEFAULT 0        COMMENT '是否正在直播',
  `live_started_at` TIMESTAMP   NULL DEFAULT NULL         COMMENT '开播时间',
  `created_at`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- ----------------------------
-- 2. 商品表
-- ----------------------------
DROP TABLE IF EXISTS `products`;
CREATE TABLE `products` (
  `id`          INT             NOT NULL AUTO_INCREMENT  COMMENT '商品ID',
  `name`        VARCHAR(100)    NOT NULL                 COMMENT '商品名称',
  `image`       VARCHAR(255)    DEFAULT NULL             COMMENT '商品图片URL',
  `description` TEXT            DEFAULT NULL             COMMENT '商品描述',
  `merchant_id` INT             NOT NULL                 COMMENT '商家ID',
  `status`      ENUM('pending','active','inactive') NOT NULL DEFAULT 'pending' COMMENT '状态：pending=待审核, active=已上架, inactive=已下架',
  `created_at`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_merchant_id` (`merchant_id`),
  CONSTRAINT `fk_products_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品表';

-- ----------------------------
-- 3. 竞拍表
-- ----------------------------
DROP TABLE IF EXISTS `auctions`;
CREATE TABLE `auctions` (
  `id`              INT             NOT NULL AUTO_INCREMENT  COMMENT '竞拍ID',
  `product_id`      INT             NOT NULL                 COMMENT '关联商品ID',
  `starting_price`  DECIMAL(10,2)   NOT NULL                 COMMENT '起拍价',
  `bid_increment`   DECIMAL(10,2)   NOT NULL DEFAULT 0.00   COMMENT '加价幅度',
  `max_price`       DECIMAL(10,2)   DEFAULT NULL             COMMENT '封顶价',
  `duration`        INT             NOT NULL                 COMMENT '拍卖时长（秒）',
  `start_time`      DATETIME        DEFAULT NULL             COMMENT '开始时间',
  `status`          ENUM('pending','active','ended','cancelled') NOT NULL DEFAULT 'pending' COMMENT '状态：pending=待开始, active=进行中, ended=已结束, cancelled=已取消',
  `sort_order`      INT             DEFAULT 0                COMMENT '排序序号',
  `highlighted`     TINYINT(1)      NOT NULL DEFAULT 0        COMMENT '是否讲解中',
  `highlight_time`  TIMESTAMP       NULL DEFAULT NULL         COMMENT '最近开始讲解时间',
  `created_at`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_auctions_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='竞拍表';

-- ----------------------------
-- 4. 直播场次表
-- ----------------------------
DROP TABLE IF EXISTS `live_sessions`;
CREATE TABLE `live_sessions` (
  `id`          INT           NOT NULL AUTO_INCREMENT  COMMENT '场次ID',
  `merchant_id` INT           NOT NULL                 COMMENT '商家ID',
  `name`        VARCHAR(100) DEFAULT NULL              COMMENT '场次名称',
  `started_at`  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '开播时间',
  `ended_at`    TIMESTAMP     NULL                     COMMENT '下播时间',
  `status`      ENUM('live','ended') DEFAULT 'live'   COMMENT '场次状态',
  PRIMARY KEY (`id`),
  KEY `idx_merchant_id` (`merchant_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_sessions_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='直播场次表';

-- 竞拍表加 session_id 字段
ALTER TABLE auctions ADD COLUMN session_id INT NULL REFERENCES live_sessions(id);

-- ----------------------------
-- 5. 出价记录表
-- ----------------------------
DROP TABLE IF EXISTS `bids`;
CREATE TABLE `bids` (
  `id`          INT             NOT NULL AUTO_INCREMENT  COMMENT '出价记录ID',
  `auction_id`  INT             NOT NULL                 COMMENT '关联竞拍ID',
  `user_id`     INT             NOT NULL                 COMMENT '出价用户ID',
  `bid_amount`  DECIMAL(10,2)   NOT NULL                 COMMENT '出价金额',
  `bid_time`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '出价时间',
  PRIMARY KEY (`id`),
  KEY `idx_auction_id` (`auction_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_bids_auction` FOREIGN KEY (`auction_id`) REFERENCES `auctions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bids_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='出价记录表';

-- ----------------------------
-- 5. 订单表
-- ----------------------------
DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id`          INT             NOT NULL AUTO_INCREMENT  COMMENT '订单ID',
  `auction_id`  INT             NOT NULL                 COMMENT '关联竞拍ID',
  `user_id`     INT             NOT NULL                 COMMENT '成交用户ID',
  `final_price` DECIMAL(10,2)   NOT NULL                 COMMENT '成交价格',
  `payment_method` ENUM('wechat','alipay','bank') DEFAULT NULL COMMENT '支付方式',
  `payment_status` ENUM('unpaid','paid','cancelled') NOT NULL DEFAULT 'unpaid' COMMENT '支付状态：unpaid=待支付, paid=已支付, cancelled=已取消',
  `logistics_status` VARCHAR(20) NOT NULL DEFAULT '未发货' COMMENT '物流状态：未发货/已发货/已签收',
  `logistics_company` VARCHAR(50) DEFAULT NULL COMMENT '物流公司',
  `tracking_number` VARCHAR(100) DEFAULT NULL COMMENT '物流单号',
  `created_at`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_auction_id` (`auction_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_orders_auction` FOREIGN KEY (`auction_id`) REFERENCES `auctions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';

# 🔧 项目配置指南

> 克隆本项目后，**必须按以下步骤修改配置**才能正常运行。

---

## 1. 创建环境变量文件

```bash
cp backend/.env.example backend/.env
```

## 2. 修改 `backend/.env`

编辑 `backend/.env` 文件，替换以下占位值：

```ini
# ===== 数据库配置 =====
DB_HOST=localhost          # MySQL 主机地址
DB_PORT=3306               # MySQL 端口
DB_USER=root               # MySQL 用户名
DB_PASSWORD=你的数据库密码  # ⚠️ 必须修改为你自己的 MySQL 密码
DB_NAME=vibecoding         # 数据库名（可用 init.sql 初始化）

# ===== Redis 配置 =====
REDIS_HOST=localhost       # Redis 主机地址
REDIS_PORT=6379            # Redis 端口

# ===== JWT 密钥（必填！） =====
JWT_SECRET=请替换为随机字符串
```

> ⚠️ **重要安全提醒：**
> - `JWT_SECRET` **不能留空**，否则后端启动时会报错退出
> - 建议用以下命令生成安全的随机密钥：
>   ```bash
>   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
>   ```

## 3. 初始化数据库

```bash
mysql -u root -p < backend/init.sql
```

这会在 MySQL 中创建 `vibecoding` 数据库及所有必要表结构。

## 4. 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd frontend
npm install
```

## 5. 启动服务

```bash
# 终端 1 - 后端（默认端口 3000）
cd backend
node index.js

# 终端 2 - 前端（默认端口 5173）
cd frontend
npm run dev
```

## 6. 运行数据库迁移脚本（如有需要）

如果表结构有更新，按需运行以下脚本：

```bash
cd backend
node migrate_all.js            # 补全所有缺失字段
node migrate_orders_columns.js # 订单表新增列迁移
node migrate_logistics.js      # 物流状态迁移
node ensure_all_tables.js      # 检查并创建缺失的表
```

---

## ❓ 常见问题

### Q: 启动后端时提示 "未设置 JWT_SECRET 环境变量"
**原因：** 你的 `backend/.env` 文件中缺少或未正确配置 `JWT_SECRET`。
**解决：** 用上述命令生成一个随机字符串，填入 `JWT_SECRET` 字段。

### Q: 数据库连接失败
**原因：** MySQL 服务未启动，或 `.env` 中的数据库密码/地址不正确。
**解决：** 检查 MySQL 是否运行，并确认 `.env` 中的 DB_HOST / DB_USER / DB_PASSWORD 正确。

### Q: Redis 连接失败
**原因：** Redis 服务未启动。
**解决：** 确保本地 Redis 已启动。如不使用 Redis，需修改后端代码移除相关依赖。

---

## 🔐 安全注意事项

| 项目 | 说明 |
|------|------|
| `.env` 文件 | **不要提交到 Git！** 它已包含在 `.gitignore` 中 |
| JWT_SECRET | 每个部署环境应使用**不同的随机密钥** |
| 数据库密码 | 生产环境请使用强密码，不要使用简单密码 |
| 端口暴露 | 生产部署时请勿将后端 3000 端口直接暴露到公网 |

# 直播竞拍系统 (Live Auction)

基于 WebSocket 实时通信的直播竞拍平台。商家可在直播间创建竞拍、讲解商品；用户可实时出价、查看竞拍动态。

## 主要功能

### 商家端
- 商品管理：创建、编辑商品，支持上传商品图片
- 竞拍管理：创建竞拍（设置起拍价/加价幅度/封顶价/时长）、开始竞拍、下架商品
- 直播场次管理：开播/下播，自动生成场次名称
- 讲解商品：标记/取消讲解中商品，自动推送至用户端
- 实时数据：通过 WebSocket 接收出价通知、成交通知
- 商品排序：拖拽调整待竞拍商品顺序

### 用户端
- 竞拍大厅：浏览所有直播中商家及在播商品数
- 直播间：实时观看商家讲解，查看商品列表（小黄车）
- 实时出价：底部滑出出价面板，支持加减/自定义输入金额
- 实时排行榜：多人出价时显示出价榜单
- 出价状态提示：未出价/最高价/被超越三种状态自动切换
- 成交通知：竞拍成功后展示成交弹窗

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite + Ant Design + Socket.io-client |
| 后端 | Node.js + Express + Socket.io |
| 数据库 | MySQL 8 + mysql2 |
| 缓存 | Redis（倒计时存储、出价节流、分布式锁） |
| 认证 | JWT（jsonwebtoken + bcrypt） |

## 项目结构

```
.
├── backend/                # 后端
│   ├── routes/             # API 路由
│   ├── socket/             # WebSocket 事件广播
│   ├── jobs/               # 定时任务（竞拍到期检查、订单超时取消）
│   ├── middleware/          # 认证中间件
│   ├── uploads/            # 用户上传图片
│   └── .env.example        # 环境变量示例
├── frontend/               # 前端
│   ├── src/pages/          # 页面组件
│   ├── src/components/     # 公共组件
│   ├── src/utils/          # 工具函数
│   └── src/api/            # HTTP 请求封装
├── .gitignore
└── README.md
```

## 本地运行

### 前置条件

- Node.js 18+
- MySQL 8.0+
- Redis

### 1. 克隆项目

```bash
git clone https://github.com/Gloriashan/tiktok.git
cd tiktok
```

（如果是从本地已有项目开始，跳过此步）

### 2. 配置数据库

在 MySQL 中执行初始化脚本：

```bash
mysql -u root -p < backend/init.sql
```

### 3. 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`，填入你的数据库、Redis 和 JWT 配置：

```
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=vibecoding
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_random_secret_here
```

> ⚠️ **JWT_SECRET 必须配置**，否则后端无法启动。建议用以下命令生成随机密钥：
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 4. 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

### 5. 启动服务

```bash
# 启动后端（端口 3000）
cd backend
node index.js

# 另开终端，启动前端（端口 5173，自动代理 /api /uploads 到后端）
cd frontend
npm run dev
```

打开浏览器访问 `http://localhost:5173`。

### 6. 多端联调

- **商家端**：注册商家账号 → 开播 → 创建竞拍 → 开始竞拍
- **用户端**：注册普通用户账号 → 从竞拍大厅进入直播间 → 出价
- 建议使用**两个不同浏览器**分别登录商家和用户

## 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 后端服务端口 | `3000` |
| `DB_HOST` | MySQL 主机地址 | `localhost` |
| `DB_USER` | MySQL 用户名 | `root` |
| `DB_PASSWORD` | MySQL 密码 | — |
| `DB_NAME` | MySQL 数据库名 | `vibecoding` |
| `REDIS_HOST` | Redis 主机地址 | `localhost` |
| `REDIS_PORT` | Redis 端口 | `6379` |
| `JWT_SECRET` | JWT 签名密钥（必填） | — |

完整示例见 `backend/.env.example`。

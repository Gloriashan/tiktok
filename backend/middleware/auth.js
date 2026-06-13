const jwt = require('jsonwebtoken')

// JWT 密钥（必须在 .env 中配置 JWT_SECRET，否则服务无法启动）
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('❌ 致命错误：未设置 JWT_SECRET 环境变量！请在 .env 文件中配置。')
  process.exit(1)
}

/**
 * JWT 验证中间件
 * 从 Authorization Header 中提取 Bearer Token 并验证
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未提供认证令牌' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded  // { id, username, role, iat, exp }
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: '令牌已过期，请重新登录' })
    }
    return res.status(401).json({ code: 401, message: '无效的认证令牌' })
  }
}

/**
 * 角色验证中间件（需要先使用 authenticate）
 * @param  {...string} roles 允许的角色列表
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ code: 401, message: '请先登录' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ code: 403, message: '权限不足' })
    }
    next()
  }
}

module.exports = { authenticate, authorize, JWT_SECRET }

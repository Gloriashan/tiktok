const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const pool = require('../db')
const { JWT_SECRET, authenticate } = require('../middleware/auth')

const router = express.Router()

// ============================================
// POST /api/auth/register - 用户注册
// ============================================
router.post('/register', async (req, res) => {
  try {
    const { username, password, role } = req.body

    // 参数校验
    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' })
    }
    if (typeof username !== 'string' || username.length < 2 || username.length > 50) {
      return res.status(400).json({ code: 400, message: '用户名长度应在2~50个字符之间' })
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ code: 400, message: '密码长度不能少于6位' })
    }

    // 校验角色（只允许 merchant 或 user）
    const validRoles = ['merchant', 'user']
    const finalRole = validRoles.includes(role) ? role : 'user'

    // 检查用户名是否已存在
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    )
    if (existing.length > 0) {
      return res.status(409).json({ code: 409, message: '用户名已被注册' })
    }

    // bcrypt 加密密码（saltRounds = 10）
    const saltRounds = 10
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    // 插入用户
    const [result] = await pool.query(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, hashedPassword, finalRole]
    )

    res.status(201).json({
      code: 201,
      message: '注册成功',
      data: {
        id: result.insertId,
        username,
        role: finalRole
      }
    })
  } catch (err) {
    console.error('注册失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// POST /api/auth/login - 用户登录
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    // 参数校验
    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' })
    }

    // 查找用户
    const [users] = await pool.query(
      'SELECT id, username, password, role, avatar FROM users WHERE username = ?',
      [username]
    )
    if (users.length === 0) {
      return res.status(401).json({ code: 401, message: '该用户不存在，请先注册' })
    }

    const user = users[0]

    // 比对密码
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ code: 401, message: '密码错误，请重新输入' })
    }

    // 生成 JWT Token（有效期 24 小时）
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          avatar: user.avatar
        }
      }
    })
  } catch (err) {
    console.error('登录失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// PUT /api/auth/reset-password - 重置密码
// ============================================
router.put('/reset-password', async (req, res) => {
  try {
    const { username, newPassword } = req.body

    if (!username || !newPassword) {
      return res.status(400).json({ code: 400, message: '用户名和新密码不能为空' })
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ code: 400, message: '密码长度不能少于6位' })
    }

    // 查找用户
    const [users] = await pool.query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    )
    if (users.length === 0) {
      return res.status(404).json({ code: 404, message: '该用户不存在' })
    }

    // bcrypt 加密新密码
    const saltRounds = 10
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds)

    // 更新密码
    await pool.query(
      'UPDATE users SET password = ? WHERE username = ?',
      [hashedPassword, username]
    )

    res.json({ code: 200, message: '密码重置成功' })
  } catch (err) {
    console.error('重置密码失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// GET /api/auth/me - 获取当前登录用户信息
// ============================================
router.get('/me', authenticate, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, role, avatar FROM users WHERE id = ?',
      [req.user.id]
    )
    if (users.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在' })
    }
    res.json({
      code: 200,
      data: users[0]
    })
  } catch (err) {
    console.error('获取用户信息失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ============================================
// PUT /api/auth/avatar - 更新用户头像
// ============================================
router.put('/avatar', authenticate, async (req, res) => {
  try {
    const { avatar } = req.body
    if (!avatar || typeof avatar !== 'string') {
      return res.status(400).json({ code: 400, message: '头像URL不能为空' })
    }

    await pool.query(
      'UPDATE users SET avatar = ? WHERE id = ?',
      [avatar, req.user.id]
    )

    res.json({
      code: 200,
      message: '头像更新成功',
      data: { avatar }
    })
  } catch (err) {
    console.error('更新头像失败：', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

module.exports = router

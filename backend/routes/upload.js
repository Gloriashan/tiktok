const express = require('express')
const multer = require('multer')
const path = require('path')

const router = express.Router()

// 配置磁盘存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'))
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${Date.now()}${ext}`)
  }
})

// 文件类型白名单
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

// 创建 multer 实例
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('仅支持 JPG/PNG/WebP 格式'))
    }
    cb(null, true)
  }
})

// POST /api/upload/image
router.post('/image', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ code: 400, message: '文件大小不能超过 5MB' })
        }
        return res.status(400).json({ code: 400, message: err.message })
      }
      return res.status(400).json({ code: 400, message: err.message })
    }

    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请选择图片' })
    }

    res.json({
      code: 200,
      message: '上传成功',
      url: `/uploads/${req.file.filename}`
    })
  })
})

module.exports = router

import { useNavigate } from 'react-router-dom'
import { UserOutlined, LogoutOutlined, ShoppingCartOutlined, CameraOutlined } from '@ant-design/icons'
import useStore from '../store'
import { useState, useRef } from 'react'
import { authAPI, uploadAPI } from '../api'

export default function ProfilePage() {
  const navigate = useNavigate()
  const userInfo = useStore(s => s.userInfo)
  const logout = useStore(s => s.logout)
  const updateAvatar = useStore(s => s.updateAvatar)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/auth', { replace: true })
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过5MB')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)

      const uploadRes = await uploadAPI.uploadImage(formData)
      const avatarUrl = uploadRes.url

      await authAPI.updateAvatar(avatarUrl)
      updateAvatar(avatarUrl)
      alert('头像上传成功')
    } catch (err) {
      alert(err.message || '上传失败，请重试')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const avatarUrl = userInfo?.avatar 
    ? `http://localhost:3000${userInfo.avatar}` 
    : null

  return (
    <div style={{ padding: '56px 0 56px' }}>
      {/* 顶部导航 */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480, height: 56, zIndex: 99,
        background: '#fff', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 17, fontWeight: 700,
        borderBottom: '1px solid #f0f0f0'
      }}>个人中心</div>

      {/* 用户信息卡片 */}
      <div style={{
        margin: '16px', padding: '24px 20px', borderRadius: 16,
        background: 'linear-gradient(135deg, #667eea, #764ba2)',
        display: 'flex', alignItems: 'center', gap: 16
      }}>
        {/* 头像区域 - 支持点击上传 */}
        <div 
          onClick={handleAvatarClick}
          style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, color: '#fff', position: 'relative',
            cursor: 'pointer', overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.3)'
          }}
        >
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt="avatar" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <UserOutlined />
          )}
          {/* 拍照图标覆盖层 */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: '24px', background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12
          }}>
            <CameraOutlined />
          </div>
          {uploading && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12
            }}>
              上传中...
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
            {userInfo?.username || '用户'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
            {userInfo?.role === 'merchant' ? '商家账号' : '普通用户'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
            点击头像更换照片
          </div>
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* 功能列表 */}
      <div style={{ padding: '0 16px' }}>
        {[
          { icon: <ShoppingCartOutlined />, label: '我的订单', onClick: () => navigate('/orders') },
          { icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout, danger: true }
        ].map((item, i) => (
          <div key={i} onClick={item.onClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px 16px', background: '#fff', borderRadius: 12,
              marginBottom: 8, cursor: 'pointer'
            }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: item.danger ? '#fff2f0' : '#f0f5ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: item.danger ? '#ff4d4f' : '#667eea', fontSize: 18
            }}>
              {item.icon}
            </div>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 500,
              color: item.danger ? '#ff4d4f' : '#333' }}>{item.label}</div>
            <div style={{ color: '#ccc', fontSize: 14 }}>›</div>
          </div>
        ))}
      </div>
    </div>
  )
}

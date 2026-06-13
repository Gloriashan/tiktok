import { useNavigate, useLocation } from 'react-router-dom'
import { ShopOutlined, FileTextOutlined, UserOutlined } from '@ant-design/icons'

/** 需要底部 Tab 栏的路径 */
const TAB_ROUTES = ['/home', '/orders', '/profile']

/** 底部固定 Tab 栏（仅用户端页面显示，直播间/商家/登录页不显示） */
export default function BottomTabBar() {
  const navigate = useNavigate()
  const location = useLocation()

  // 只在用户端页面显示
  if (!TAB_ROUTES.includes(location.pathname)) return null

  const tabs = [
    { key: '/home',  label: '竞拍大厅', icon: <ShopOutlined /> },
    { key: '/orders', label: '我的订单', icon: <FileTextOutlined /> },
    { key: '/profile', label: '个人中心', icon: <UserOutlined /> }
  ]

  const current = location.pathname

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: '50%',
      transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480, height: 56,
      background: '#fff', borderTop: '1px solid #f0f0f0',
      display: 'flex', zIndex: 100, boxShadow: '0 -2px 8px rgba(0,0,0,0.04)'
    }}>
      {tabs.map(tab => (
        <div key={tab.key}
          onClick={() => navigate(tab.key)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            color: current === tab.key ? '#667eea' : '#999',
            transition: 'color 0.2s'
          }}>
          <div style={{ fontSize: 20, marginBottom: 2 }}>{tab.icon}</div>
          <div style={{ fontSize: 10, fontWeight: current === tab.key ? 600 : 400 }}>
            {tab.label}
          </div>
        </div>
      ))}
    </div>
  )
}

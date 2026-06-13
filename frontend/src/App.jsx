import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import OrdersPage from './pages/OrdersPage'
import ProfilePage from './pages/ProfilePage'
import MerchantDashboard from './pages/MerchantDashboard'
import PaymentPage from './pages/PaymentPage'
import LiveRoomPage from './pages/LiveRoomPage'
import BottomTabBar from './components/BottomTabBar'
import useStore from './store'
import { authAPI } from './api'

function ProtectedRoute({ children }) {
  const userInfo = useStore(s => s.userInfo)
  if (!userInfo) return <Navigate to="/auth" replace />
  return children
}

function HomeRoute() {
  const userInfo = useStore(s => s.userInfo)
  if (!userInfo) return <Navigate to="/auth" replace />
  if (userInfo.role === 'merchant') return <Navigate to="/merchant" replace />
  return <Navigate to="/home" replace />
}

export default function App() {
  const userInfo = useStore(s => s.userInfo)
  const setUser = useStore(s => s.setUser)
  const token = useStore(s => s.token)

  // 应用启动时刷新用户信息（更新头像等字段）
  useEffect(() => {
    if (!token) return
    const refreshUserInfo = async () => {
      try {
        const res = await authAPI.getMe()
        if (res.data) {
          setUser(res.data)
        }
      } catch (err) {
        // 静默失败，不影响正常使用
      }
    }
    refreshUserInfo()
  }, [token, setUser])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/merchant" element={<ProtectedRoute><MerchantDashboard /></ProtectedRoute>} />
        <Route path="/live/:merchantId" element={<ProtectedRoute><LiveRoomPage /></ProtectedRoute>} />
        <Route path="/pay/:orderId" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomTabBar />
    </BrowserRouter>
  )
}

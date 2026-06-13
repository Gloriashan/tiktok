import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Select, Tabs, message, Typography, Drawer, Steps } from 'antd'
import { UserOutlined, LockOutlined, SafetyOutlined, MobileOutlined } from '@ant-design/icons'
import api from '../api'
import useStore from '../store'
import socket from '../socket'

const { Title, Text } = Typography

export default function AuthPage() {
  const navigate = useNavigate()
  const setUser = useStore(s => s.setUser)
  const setToken = useStore(s => s.setToken)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('login')
  const [loginForm] = Form.useForm()
  const [registerForm] = Form.useForm()

  // ========== 忘记密码 ==========
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotStep, setForgotStep] = useState(0)
  const [forgotUsername, setForgotUsername] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [verificationCode, setVerificationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const timerRef = useRef(null)

  // ========== 登录 ==========
  const handleLogin = async (values) => {
    setLoading(true)
    try {
      console.log('[登录] 正在登录:', values.username)
      const res = await api.post('/auth/login', values)
      // res = { code: 200, message: '登录成功', data: { token, user } }
      setToken(res.data.token)
      setUser(res.data.user)
      // 加入用户专属 WebSocket 房间
      if (!socket.connected) socket.connect()
      socket.emit('join_user_room', res.data.user.id)
      message.success('登录成功')
      const target = res.data.user.role === 'merchant' ? '/merchant' : '/home'
      navigate(target, { replace: true })
    } catch (err) {
      // err = 后端返回的错误对象，如 { code: 401, message: '该用户不存在，请先注册' }
      // 或 { code: 401, message: '密码错误，请重新输入' }
      // 或网络错误 { message: '请求失败，请检查网络' }
      const errorMsg = err?.message || '操作失败，请稍后重试'
      message.error(errorMsg)
      console.warn('[登录] 失败:', errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // ========== 注册 ==========
  const handleRegister = async (values) => {
    setLoading(true)
    try {
      console.log('[注册] 正在注册:', values.username)
      await api.post('/auth/register', {
        username: values.username,
        password: values.password,
        role: values.role || 'user'
      })
      // 注册成功 → 提示并切到登录 tab
      message.success('注册成功，请登录')
      setActiveTab('login')
      registerForm.resetFields()
      // 把注册成功的用户名填入登录表单
      loginForm.setFieldsValue({ username: values.username, password: '' })
    } catch (err) {
      // err = 后端返回的错误对象
      // { code: 409, message: '用户名已被注册' }
      // { code: 400, message: '密码长度不能少于6位' }
      // 或网络错误
      const errorMsg = err?.message || '操作失败，请稍后重试'
      message.error(errorMsg)
      console.warn('[注册] 失败:', errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // ========== 忘记密码 - 倒计时 ==========
  useEffect(() => {
    if (countdown > 0) {
      timerRef.current = setTimeout(() => setCountdown(countdown - 1), 1000)
    }
    return () => clearTimeout(timerRef.current)
  }, [countdown])

  // ========== 发送验证码 ==========
  const handleSendCode = () => {
    if (!forgotUsername.trim()) {
      message.warning('请先输入用户名')
      return
    }
    setCountdown(60)
    setCodeSent(true)
    setForgotStep(1)
    message.success('验证码已发送（纯前端模拟）')
  }

  // ========== 下一步 ==========
  const handleNextStep = () => {
    if (!verificationCode.trim()) {
      message.warning('请输入验证码')
      return
    }
    setForgotStep(2)
  }

  // ========== 确认重置密码 ==========
  const handleResetPassword = async () => {
    if (!newPassword) {
      message.warning('请输入新密码')
      return
    }
    if (newPassword.length < 6) {
      message.warning('密码长度不能少于6位')
      return
    }
    if (newPassword !== confirmPassword) {
      message.warning('两次输入的密码不一致')
      return
    }
    setResetting(true)
    try {
      await api.put('/auth/reset-password', { username: forgotUsername, newPassword })
      message.success('密码重置成功，请重新登录')
      setForgotOpen(false)
      resetForgotState()
    } catch (err) {
      message.error(err?.message || '重置失败')
    } finally {
      setResetting(false)
    }
  }

  // ========== 打开/关闭忘记密码弹窗 ==========
  const handleOpenForgot = () => {
    resetForgotState()
    setForgotOpen(true)
    setForgotUsername(loginForm.getFieldValue('username') || '')
  }

  const handleCloseForgot = () => {
    setForgotOpen(false)
    resetForgotState()
  }

  const resetForgotState = () => {
    setForgotStep(0)
    setForgotUsername('')
    setCodeSent(false)
    setCountdown(0)
    setVerificationCode('')
    setNewPassword('')
    setConfirmPassword('')
    clearTimeout(timerRef.current)
  }

  // ========== 切换 Tab 时清空表单 ==========
  const onTabChange = (key) => {
    setActiveTab(key)
    if (key === 'login') {
      registerForm.resetFields()
    } else {
      loginForm.resetFields()
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f5f5',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* ===== 顶部 Logo / 标题区域（渐变背景） ===== */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '48px 24px 32px',
        textAlign: 'center'
      }}>
        <Title level={2} style={{ color: '#fff', marginBottom: 4 }}>直播竞拍系统</Title>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>
          安全可信的直播竞拍平台
        </Text>
      </div>

      {/* ===== Tab 切换 + 表单区域 ===== */}
      <div style={{ flex: 1, padding: '24px 24px', display: 'flex', flexDirection: 'column' }}>
        <Tabs
          activeKey={activeTab}
          onChange={onTabChange}
          centered
          style={{ marginBottom: 8 }}
          items={[
            { key: 'login', label: '登录' },
            { key: 'register', label: '注册' }
          ]}
        />

        {/* ===== 登录表单 ===== */}
        {activeTab === 'login' && (
          <Form form={loginForm} onFinish={handleLogin} autoComplete="off">
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="用户名"
                style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
                style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8 }}
              >
                登录
              </Button>
            </Form.Item>
            <div style={{ textAlign: 'right', marginTop: -8 }}>
              <Button type="link" size="small" onClick={handleOpenForgot} style={{ fontSize: 12 }}>
                忘记密码？
              </Button>
            </div>
          </Form>
        )}

        {/* ===== 注册表单 ===== */}
        {activeTab === 'register' && (
          <Form form={registerForm} onFinish={handleRegister} autoComplete="off">
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 2, message: '用户名至少2个字符' }
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="用户名"
                style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6位' }
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
                style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item name="role" initialValue="user">
              <Select
                options={[
                  { value: 'user', label: '普通用户' },
                  { value: 'merchant', label: '商家' }
                ]}
                style={{ width: '100%', height: 48, fontSize: 16 }}
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8 }}
              >
                注册
              </Button>
            </Form.Item>
          </Form>
        )}
      </div>

      {/* ===== 忘记密码三步 - 底部上滑 Drawer ===== */}
      <Drawer
        title="重置密码"
        placement="bottom"
        height="auto"
        open={forgotOpen}
        onClose={handleCloseForgot}
        destroyOnClose
      >
        <Steps
          current={forgotStep}
          size="small"
          style={{ margin: '0 0 24px' }}
          items={[
            { title: '验证身份' },
            { title: '验证码' },
            { title: '设置新密码' }
          ]}
        />

        {/* 第一步：输入用户名 */}
        {forgotStep === 0 && (
          <div style={{ padding: '8px 0' }}>
            <Input
              prefix={<UserOutlined />}
              placeholder="请输入您的用户名"
              value={forgotUsername}
              onChange={e => setForgotUsername(e.target.value)}
              style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8, marginBottom: 12 }}
            />
            <Button
              type="primary"
              block
              onClick={handleSendCode}
              disabled={countdown > 0}
              style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8 }}
            >
              {countdown > 0 ? `${countdown}秒后重新发送` : '发送验证码'}
            </Button>
          </div>
        )}

        {/* 第二步：输入验证码 */}
        {forgotStep === 1 && (
          <div style={{ padding: '8px 0' }}>
            <Input
              prefix={<SafetyOutlined />}
              placeholder="请输入验证码"
              value={verificationCode}
              onChange={e => setVerificationCode(e.target.value)}
              style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8, marginBottom: 12 }}
            />
            <Button
              type="primary"
              block
              onClick={handleNextStep}
              style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8 }}
            >
              下一步
            </Button>
          </div>
        )}

        {/* 第三步：设置新密码 */}
        {forgotStep === 2 && (
          <div style={{ padding: '8px 0' }}>
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入新密码（至少6位）"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8, marginBottom: 12 }}
            />
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请确认新密码"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8, marginBottom: 12 }}
            />
            <Button
              type="primary"
              block
              onClick={handleResetPassword}
              loading={resetting}
              style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 8 }}
            >
              确认重置
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  )
}

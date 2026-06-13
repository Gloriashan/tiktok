import axios from 'axios'
import useStore from '../store'

const BASE_URL = 'http://localhost:3000/api'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use((config) => {
  const token = useStore.getState().token || localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
}, (error) => Promise.reject(error))

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      if (status === 401 && !window.location.pathname.startsWith('/auth')) {
        useStore.getState().logout()
        window.location.href = '/auth'
      }
      return Promise.reject(data || { message: '请求失败' })
    }
    return Promise.reject({ message: '请求失败，请检查网络' })
  }
)

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  resetPassword: (data) => api.put('/auth/reset-password', data),
  getMe: () => api.get('/auth/me'),
  updateAvatar: (avatar) => api.put('/auth/avatar', { avatar })
}

export const uploadAPI = {
  uploadImage: (formData) => {
    return api.post('/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}

export default api

import { create } from 'zustand'

const useStore = create((set) => ({
  // 用户信息
  userInfo: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || '',

  // WebSocket 相关状态
  currentPrice: 0,
  bidCount: 0,
  isConnected: false,
  highlightedProduct: null,

  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user))
    set({ userInfo: user })
  },

  setToken: (token) => {
    localStorage.setItem('token', token)
    set({ token })
  },

  setCurrentPrice: (price) => set({ currentPrice: price }),
  setBidCount: (count) => set({ bidCount: count }),
  setConnected: (status) => set({ isConnected: status }),
  setHighlightedProduct: (product) => set({ highlightedProduct: product }),

  updateAvatar: (avatarUrl) => {
    set((state) => {
      const newUserInfo = { ...state.userInfo, avatar: avatarUrl }
      localStorage.setItem('user', JSON.stringify(newUserInfo))
      return { userInfo: newUserInfo }
    })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ userInfo: null, token: '' })
  }
}))

export default useStore

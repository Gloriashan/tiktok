import { io } from 'socket.io-client'

const socket = io('http://localhost:3000', {
  autoConnect: false,  // 手动控制连接时机
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000
})

// ========== 心跳保活 ==========
let pingTimer = null
let missedPongs = 0

socket.on('connect', () => {
  missedPongs = 0
  pingTimer = setInterval(() => {
    if (missedPongs >= 3) {
      console.log('[心跳] 连续3次未收到pong，主动重连')
      socket.disconnect()
      socket.connect()
      missedPongs = 0
      return
    }
    missedPongs++
    socket.emit('ping')
  }, 5000)
})

socket.on('pong', () => {
  missedPongs = 0
})

socket.on('disconnect', () => {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
})

export default socket

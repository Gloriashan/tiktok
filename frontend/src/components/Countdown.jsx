import { useState, useEffect } from 'react'

export default function Countdown({ endTime }) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.floor((endTime - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [endTime])

  // 无效 endTime 时显示 --:--
  if (endTime == null || isNaN(Number(endTime)) || Number(endTime) <= 0) {
    return <span style={{ color: '#e84343', fontSize: 10 }}>⏱ --:--</span>
  }

  const m = String(Math.floor(remaining / 60)).padStart(2, '0')
  const s = String(remaining % 60).padStart(2, '0')

  return <span style={{ color: '#e84343', fontSize: 10 }}>⏱ {m}:{s}</span>
}

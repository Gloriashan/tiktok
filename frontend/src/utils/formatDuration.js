/**
 * 将秒数格式化为可读时长
 *
 * @param {number|string} seconds - 总秒数
 * @returns {string} 格式化后的时长字符串，如 "5分钟" / "1分30秒" / "45秒"
 */
export const formatDuration = (seconds) => {
  const s = Number(seconds)
  if (isNaN(s) || s <= 0) return '-'
  const mins = Math.floor(s / 60)
  const secs = s % 60
  if (mins > 0 && secs > 0) return `${mins}分${secs}秒`
  if (mins > 0) return `${mins}分钟`
  return `${secs}秒`
}

/**
 * 将 end_time（可能为 MySQL datetime 字符串 / Unix 秒级 / Unix 毫秒级）
 * 统一转为毫秒级时间戳。无效值返回 null。
 *
 * @param {any} endTime
 * @returns {number|null}
 */
export const parseEndTime = (endTime) => {
  if (endTime == null) return null

  // 已是数字
  if (typeof endTime === 'number') {
    // 秒级时间戳（10位数字）→ 毫秒
    if (endTime > 1e10 && endTime < 1e15) return endTime
    // 毫秒级时间戳（13位）
    if (endTime > 1e12) return endTime
  }

  // 数字字符串
  const num = Number(endTime)
  if (!isNaN(num) && num > 1e10) {
    if (num < 1e12) return num * 1000 // 秒级
    return num // 毫秒级
  }

  // MySQL datetime 字符串（如 "2026-06-04 15:30:00" 或 "2026-06-04T15:30:00.000Z"）
  const ts = new Date(endTime).getTime()
  if (!isNaN(ts)) return ts

  return null
}

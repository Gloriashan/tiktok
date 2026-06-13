const recoverRedisData = async (pool, redis) => {
  console.log('[Redis恢复] 开始从 MySQL 恢复数据...')
  try {
    // 查出所有进行中的竞拍
    const [auctions] = await pool.query(
      "SELECT a.*, p.merchant_id FROM auctions a JOIN products p ON a.product_id = p.id WHERE a.status = 'active'"
    )
    for (const auction of auctions) {
      // 恢复结束时间
      const endTime = new Date(auction.start_time).getTime() + auction.duration * 1000
      await redis.set(`auction:${auction.id}:endTime`, endTime, { EX: 3600 })
      // 恢复当前最高价
      const [topBid] = await pool.query(
        'SELECT bid_amount, user_id FROM bids WHERE auction_id = ? ORDER BY bid_amount DESC LIMIT 1',
        [auction.id]
      )
      if (topBid.length > 0) {
        await redis.set(`auction:${auction.id}:currentPrice`, topBid[0].bid_amount)
        await redis.set(`auction:${auction.id}:leaderId`, topBid[0].user_id)
      }

      // 重建排行榜 ZSet
      const [bids] = await pool.query(
        `SELECT u.username, b.bid_amount AS amount
         FROM bids b
         JOIN users u ON b.user_id = u.id
         WHERE b.auction_id = ?
         ORDER BY b.bid_amount DESC
         LIMIT 20`,
        [auction.id]
      )
      if (bids.length > 0) {
        const leaderboardKey = `auction:${auction.id}:leaderboard`
        await redis.del(leaderboardKey)
        await redis.zAdd(
          leaderboardKey,
          bids.map(bid => ({ score: bid.amount, value: bid.username }))
        )
        console.log(`[Redis恢复] 竞拍 ${auction.id} 排行榜重建完成，共 ${bids.length} 条`)
      }

      console.log(`[Redis恢复] 竞拍 ${auction.id} 恢复完成`)
    }
    console.log(`[Redis恢复] 共恢复 ${auctions.length} 场竞拍`)
  } catch (err) {
    console.error('[Redis恢复] 恢复失败:', err.message)
  }
}
module.exports = { recoverRedisData }

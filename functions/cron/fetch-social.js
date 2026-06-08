// Cron: fetch-social（每30分钟）
// 获取社交媒体粉丝数据

export default {
  async scheduled(event, env) {
    const taskName = 'fetch-social';

    try {
      const lastRun = await env.DB.prepare(
        'SELECT last_run_at FROM fetch_log WHERE task_name = ?'
      ).bind(taskName).first();

      if (lastRun?.last_run_at) {
        const elapsed = Date.now() - new Date(lastRun.last_run_at).getTime();
        if (elapsed < 25 * 60 * 1000) return;
      }

      const accountsStr = await env.KV.get('config:social_accounts');
      if (!accountsStr) return;
      const accounts = JSON.parse(accountsStr);
      if (!accounts.length) return;

      const results = await Promise.allSettled(
        accounts.map(acc => fetchAccount(acc, env.DB))
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO fetch_log (task_name, last_run_at, last_status)
         VALUES (?, datetime('now'), ?)`
      ).bind(taskName, successCount > 0 ? 'success' : 'error').run();

    } catch {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO fetch_log (task_name, last_run_at, last_status)
         VALUES (?, datetime('now'), 'error')`
      ).bind(taskName).run().catch(() => {});
    }
  }
};

async function fetchAccount(account, db) {
  const { platform, accountId, name } = account;

  if (platform === 'bilibili') {
    const res = await fetch(`https://api.bilibili.com/x/relation/stat?vmid=${accountId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return;
    const json = await res.json();
    const count = json.data?.follower;
    if (count !== undefined) {
      await db.prepare(
        `INSERT INTO social_stats (platform, account_id, account_name, follower_count)
         VALUES (?, ?, ?, ?)`
      ).bind(platform, accountId, name || '', count).run();
    }
  }

  // YouTube 和 Twitter 需要 API key，预留接口
  // 实际部署时需要配置 YOUTUBE_API_KEY / TWITTER_BEARER_TOKEN
}

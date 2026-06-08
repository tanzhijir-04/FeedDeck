// Cron: fetch-social（每30分钟）
// 获取社交媒体粉丝数据

export async function onRequestGet(context) {
  const { env } = context;
  const taskName = 'fetch-social';
  var totalFetched = 0;

  try {
    const lastRun = await env.DB.prepare(
      'SELECT last_run_at FROM fetch_log WHERE task_name = ?'
    ).bind(taskName).first();

    const url = new URL(context.request.url);
    const force = url.searchParams.get('force') === '1';
    if (!force && lastRun?.last_run_at) {
      const elapsed = Date.now() - new Date(lastRun.last_run_at).getTime();
      if (elapsed < 25 * 60 * 1000) return new Response(JSON.stringify({ success: true, skipped: true, reason: '冷却期未到' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const accountsStr = await env.KV.get('config:social_accounts');
    if (!accountsStr) return new Response(JSON.stringify({ success: true, skipped: true, reason: '未配置社交媒体账号' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const accounts = JSON.parse(accountsStr);
    if (!accounts.length) return new Response(JSON.stringify({ success: true, skipped: true, reason: '未配置社交媒体账号' }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const results = await Promise.allSettled(
      accounts.map(acc => fetchAccount(acc, env.DB))
    );

    results.forEach(r => {
      if (r.status === 'fulfilled' && typeof r.value === 'number') totalFetched += r.value;
    });

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

  return new Response(JSON.stringify({ success: true, fetched: totalFetched }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function fetchAccount(account, db) {
  const { platform, accountId, name } = account;

  if (platform === 'bilibili') {
    const res = await fetch(`https://api.bilibili.com/x/relation/stat?vmid=${accountId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const count = json.data?.follower;
    if (count !== undefined) {
      await db.prepare(
        `INSERT INTO social_stats (platform, account_id, account_name, follower_count)
         VALUES (?, ?, ?, ?)`
      ).bind(platform, accountId, name || '', count).run();
      return 1;
    }
  }

  // YouTube 和 Twitter 需要 API key，预留接口
  // 实际部署时需要配置 YOUTUBE_API_KEY / TWITTER_BEARER_TOKEN
  return 0;
}

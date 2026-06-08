// Cron: fetch-social（每30分钟）
// 获取社交媒体粉丝数据
//
// 已知限制：B站 API 会封锁 Cloudflare Worker IP（返回 412/-401）
// 如果需要显示 B站粉丝数，需要从非 Cloudflare IP 手动设置或使用代理

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

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
    // B站 API 会封锁 Cloudflare Worker IP（412/-401）
    // 尝试 x/web-interface/card 接口，如果失败则跳过
    try {
      const res = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${accountId}`, {
        headers: { 'User-Agent': MOBILE_UA, 'Referer': 'https://m.bilibili.com/' }
      });
      const text = await res.text();
      // 检查是否返回 HTML（被封）
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) return 0;
      const json = JSON.parse(text);
      if (json.code === 0 && json.data?.card) {
        const card = json.data.card;
        const follower = json.data.follower ?? card.follower ?? 0;
        if (follower > 0) {
          await db.prepare(
            `INSERT INTO social_stats (platform, account_id, account_name, follower_count)
             VALUES (?, ?, ?, ?)`
          ).bind(platform, accountId, name || card.name || '', follower).run();
          return 1;
        }
      }
    } catch { /* B站 API 被封，跳过 */ }
    return 0;
  }

  // YouTube 和 Twitter 需要 API key，预留接口
  return 0;
}

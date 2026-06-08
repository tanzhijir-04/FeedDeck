// Cron: fetch-social（每30分钟）
// 获取社交媒体粉丝数据

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

export async function onRequestGet(context) {
  const { env } = context;
  const taskName = 'fetch-social';
  var totalFetched = 0;
  var errors = [];

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

    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && typeof r.value === 'number') {
        totalFetched += r.value;
      } else if (r.status === 'fulfilled' && r.value?.error) {
        errors.push(accounts[i].platform + ': ' + r.value.error);
      } else if (r.status === 'rejected') {
        errors.push(accounts[i].platform + ': ' + (r.reason?.message || 'unknown'));
      }
    });

    const successCount = results.filter(r => r.status === 'fulfilled' && typeof r.value === 'number').length;
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

  const resp = { success: true, fetched: totalFetched };
  if (errors.length) resp.errors = errors;
  return new Response(JSON.stringify(resp), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function fetchAccount(account, db) {
  const { platform, accountId, name } = account;

  if (platform === 'bilibili') {
    // 使用 x/web-interface/card 接口（返回用户信息 + 粉丝数）
    // 注意：x/relation/stat 从 Cloudflare Worker 调用会返回 412 风控
    try {
      const res = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${accountId}`, {
        headers: { 'User-Agent': MOBILE_UA, 'Referer': 'https://m.bilibili.com/' }
      });
      const text = await res.text();
      const json = JSON.parse(text);
      if (json.code === 0 && json.data?.card) {
        const card = json.data.card;
        // follower 可能在 data 层或 card 层
        const follower = json.data.follower ?? card.follower ?? 0;
        const nickname = name || card.name || '';
        await db.prepare(
          `INSERT INTO social_stats (platform, account_id, account_name, follower_count)
           VALUES (?, ?, ?, ?)`
        ).bind(platform, accountId, nickname, follower).run();
        return 1;
      }
      // 调试：返回 API 响应结构
      return { error: 'bilibili api: code=' + json.code + ' data_keys=' + Object.keys(json.data || {}).join(',') };
    } catch (e) { return { error: e.message }; }
  }

  // YouTube 和 Twitter 需要 API key，预留接口
  return 0;
}

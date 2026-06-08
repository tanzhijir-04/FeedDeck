// Cron: fetch-social（每30分钟）
// 获取社交媒体粉丝数据

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

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

    const successCount = results.filter(r => r.status === 'fulfilled' && (!r.value || typeof r.value === 'number')).length;
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
    // 主接口：relation/stat（使用移动端 UA 避免 412 风控）
    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
    try {
      const res = await fetch(`https://api.bilibili.com/x/relation/stat?vmid=${accountId}`, {
        headers: { 'User-Agent': mobileUA, 'Referer': 'https://m.bilibili.com/' }
      });
      if (res.ok) {
        const json = await res.json();
        // B站 API 可能返回 code:0 (成功) 或 code:-412 (风控) 等
        if (json.code === 0 && json.data?.follower !== undefined) {
          await db.prepare(
            `INSERT INTO social_stats (platform, account_id, account_name, follower_count)
             VALUES (?, ?, ?, ?)`
          ).bind(platform, accountId, name || '', json.data.follower).run();
          return 1;
        }
        // API 返回了但数据异常，尝试备用接口
        return await fetchBilibiliFallback(accountId, name, platform, db);
      }
      // HTTP 失败，尝试备用接口
      return await fetchBilibiliFallback(accountId, name, platform, db);
    } catch {
      return await fetchBilibiliFallback(accountId, name, platform, db);
    }
  }

  // YouTube 和 Twitter 需要 API key，预留接口
  return 0;
}

// B站备用接口：通过空间页面获取粉丝数
async function fetchBilibiliFallback(accountId, name, platform, db) {
  const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  try {
    const res = await fetch(`https://api.bilibili.com/x/space/acc/info?mid=${accountId}`, {
      headers: { 'User-Agent': mobileUA, 'Referer': 'https://m.bilibili.com/' }
    });
    if (!res.ok) return { error: 'fallback HTTP ' + res.status };
    const json = await res.json();
    if (json.code !== 0) return { error: 'bilibili code ' + json.code };

    // acc/info 不直接返回粉丝数，但可以确认账号存在
    // 再调用 relation/stat 确认
    const statRes = await fetch(`https://api.bilibili.com/x/relation/stat?vmid=${accountId}`, {
      headers: {
        'User-Agent': mobileUA,
        'Referer': 'https://m.bilibili.com/'
      }
    });
    if (!statRes.ok) return { error: 'stat fallback HTTP ' + statRes.status };
    const statJson = await statRes.json();
    if (statJson.code === 0 && statJson.data?.follower !== undefined) {
      await db.prepare(
        `INSERT INTO social_stats (platform, account_id, account_name, follower_count)
         VALUES (?, ?, ?, ?)`
      ).bind(platform, accountId, name || statJson.data.name || '', statJson.data.follower).run();
      return 1;
    }
    return { error: 'bilibili stat code ' + statJson.code };
  } catch (e) {
    return { error: e.message };
  }
}

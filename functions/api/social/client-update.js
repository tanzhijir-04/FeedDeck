// POST /api/social/client-update
// 客户端直连上报粉丝数据（绕过 Worker IP 被封的问题）

export async function onRequestPost(context) {
  const { request, env } = context;

  // 认证检查
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/fd_session=([^;]+)/);
  if (!match) {
    return json({ error: '未登录' }, 401);
  }
  const session = await env.DB.prepare(
    'SELECT token, expires_at FROM sessions WHERE token = ?'
  ).bind(match[1]).first();
  if (!session || new Date(session.expires_at) < new Date()) {
    return json({ error: '未登录' }, 401);
  }

  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const { platform, accountId, followerCount } = body;

  // 参数校验
  if (!platform || !accountId || followerCount == null) {
    return json({ error: '缺少必填参数' }, 400);
  }
  if (!Number.isInteger(followerCount) || followerCount < 0) {
    return json({ error: 'followerCount 必须是非负整数' }, 400);
  }

  // 从配置中获取账号名（可选）
  let accountName = '';
  try {
    const configStr = await env.KV.get('config:social_accounts');
    if (configStr) {
      const accounts = JSON.parse(configStr);
      const found = accounts.find(a => a.platform === platform && a.accountId === String(accountId));
      if (found) accountName = found.name || '';
    }
  } catch { /* 忽略 */ }

  // 写入 D1
  await env.DB.prepare(
    `INSERT INTO social_stats (platform, account_id, account_name, follower_count)
     VALUES (?, ?, ?, ?)`
  ).bind(platform, String(accountId), accountName, followerCount).run();

  // 写入 KV 缓存（TTL 1 小时）
  await env.KV.put(
    `cache:social:${accountId}`,
    JSON.stringify({ followerCount, fetchedAt: new Date().toISOString() }),
    { expirationTtl: 3600 }
  );

  return json({ success: true });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

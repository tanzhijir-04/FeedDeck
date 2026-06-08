// FeedDeck Auth Middleware
// 检查 session cookie，未认证返回 401

const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/check'];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 公开路径跳过认证
  if (PUBLIC_PATHS.includes(url.pathname)) {
    return context.next();
  }

  // 静态文件跳过认证（HTML/CSS/JS）
  if (!url.pathname.startsWith('/api/')) {
    return context.next();
  }

  // 从 cookie 提取 session token
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/fd_session=([^;]+)/);
  if (!match) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = match[1];

  // 查询 session 是否有效
  const session = await env.DB.prepare(
    'SELECT token, expires_at FROM sessions WHERE token = ?'
  ).bind(token).first();

  if (!session) {
    return new Response(JSON.stringify({ error: '会话无效' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 检查过期
  if (new Date(session.expires_at) < new Date()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return new Response(JSON.stringify({ error: '会话已过期' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 认证通过，继续处理
  return context.next();
}

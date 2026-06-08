// GET /api/auth/check
// 验证 session 有效性

export async function onRequestGet(context) {
  const { request, env } = context;

  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/fd_session=([^;]+)/);

  if (!match) {
    return jsonResponse({ authenticated: false }, 401);
  }

  const session = await env.DB.prepare(
    'SELECT token, expires_at FROM sessions WHERE token = ?'
  ).bind(match[1]).first();

  if (!session || new Date(session.expires_at) < new Date()) {
    return jsonResponse({ authenticated: false }, 401);
  }

  return jsonResponse({ authenticated: true });
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

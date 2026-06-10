// POST /api/auth/logout
// 删除 session + 清除 cookie

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/fd_session=([^;]+)/);

    if (match) {
      // 删除 D1 中的 session
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?')
        .bind(match[1]).run();
    }

    // 清除 cookie
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'fd_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: '登出失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

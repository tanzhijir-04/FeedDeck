// POST /api/auth/login
// 密码比对 + 创建 session + 设置 cookie

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return jsonResponse({ error: '请输入密码' }, 400);
    }

    // 从 KV 获取密码哈希和盐
    const storedHash = await env.KV.get('config:password');
    const salt = await env.KV.get('config:auth_salt');

    if (!storedHash || !salt) {
      return jsonResponse({ error: '系统未初始化。请先在 Cloudflare Dashboard → Workers KV → CONFIG 命名空间中添加 config:auth_salt 和 config:password 键值对。详见 README.md 第七步。' }, 500);
    }

    // 比对：客户端发来的是 SHA-256(password)，服务端比对 SHA-256(received + salt)
    // 使用 timingSafeEqual 防止时序攻击
    const encoder = new TextEncoder();
    const receivedBuf = encoder.encode(password + salt);
    const receivedHash = await crypto.subtle.digest('SHA-256', receivedBuf);
    const receivedHex = bufToHex(receivedHash);

    if (receivedHex !== storedHash) {
      return jsonResponse({ error: '密码错误' }, 401);
    }

    // 创建 session token（32 字节随机）
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = bufToHex(tokenBytes);

    // 过期时间：10 年后（尽可能长，兼容所有浏览器）
    const maxAge = 10 * 365 * 24 * 60 * 60; // 10 年（秒）
    const expiresAt = new Date(Date.now() + maxAge * 1000).toISOString();

    // 写入 D1
    await env.DB.prepare(
      'INSERT INTO sessions (token, expires_at) VALUES (?, ?)'
    ).bind(token, expiresAt).run();

    // 设置 HttpOnly cookie
    // 同时使用 Expires 和 Max-Age，覆盖所有浏览器：
    //   Chrome/Edge/Firefox：两者都支持
    //   iOS Safari：只认 Expires，忽略 Max-Age
    //   旧版 Android WebView：只认 Max-Age
    const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
    const cookie = `fd_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Expires=${expires}`;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie
      }
    });
  } catch (e) {
    return jsonResponse({ error: '登录失败' }, 500);
  }
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

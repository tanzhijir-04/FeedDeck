// PUT /api/config/password — 修改密码

export async function onRequestPut(context) {
  const { request, env } = context;

  try {
    const { old_password, new_password } = await request.json();

    if (!old_password || !new_password) {
      return jsonResponse({ error: '请输入完整密码' }, 400);
    }

    // 获取存储的密码和盐
    const storedHash = await env.KV.get('config:password');
    const salt = await env.KV.get('config:auth_salt');

    if (!storedHash || !salt) {
      return jsonResponse({ error: '系统未初始化' }, 500);
    }

    // 验证旧密码
    const encoder = new TextEncoder();
    const oldBuf = encoder.encode(old_password + salt);
    const oldHash = await crypto.subtle.digest('SHA-256', oldBuf);
    const oldHex = bufToHex(oldHash);

    if (oldHex !== storedHash) {
      return jsonResponse({ error: '当前密码错误' }, 401);
    }

    // 生成新盐 + 新哈希
    const newSaltBytes = new Uint8Array(16);
    crypto.getRandomValues(newSaltBytes);
    const newSalt = bufToHex(newSaltBytes);

    const newBuf = encoder.encode(new_password + newSalt);
    const newHash = await crypto.subtle.digest('SHA-256', newBuf);
    const newHex = bufToHex(newHash);

    // 更新 KV
    await Promise.all([
      env.KV.put('config:password', newHex),
      env.KV.put('config:auth_salt', newSalt)
    ]);

    // 使所有现有 session 失效
    await env.DB.prepare('DELETE FROM sessions WHERE 1=1').run();

    // 设置新 cookie
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = bufToHex(tokenBytes);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare(
      'INSERT INTO sessions (token, expires_at) VALUES (?, ?)'
    ).bind(token, expiresAt).run();

    const isSecure = new URL(request.url).protocol === 'https:';
    const cookie = `fd_session=${token}; Path=/; HttpOnly${isSecure ? '; Secure' : ''}; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie
      }
    });
  } catch (e) {
    return jsonResponse({ error: '修改密码失败' }, 500);
  }
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

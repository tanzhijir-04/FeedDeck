// POST /api/config/ics — 添加 ICS 订阅

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { url } = await request.json();
    if (!url) return jsonResponse({ error: '请输入 ICS 地址' }, 400);

    try { new URL(url); } catch {
      return jsonResponse({ error: '无效的 URL 格式' }, 400);
    }

    const subs = parseJson(await env.KV.get('config:calendar_subs'), []);

    if (subs.some(s => s.url === url)) {
      return jsonResponse({ error: '该订阅已存在' }, 409);
    }

    const id = 'ics_' + Date.now().toString(36);
    const name = new URL(url).hostname.replace('www.', '');

    subs.push({ id, name, url });
    await env.KV.put('config:calendar_subs', JSON.stringify(subs));

    return jsonResponse({ success: true, id });
  } catch (e) {
    return jsonResponse({ error: '添加失败' }, 500);
  }
}

function parseJson(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

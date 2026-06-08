// POST /api/config/rss — 添加 RSS 源

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { url } = await request.json();
    if (!url) return jsonResponse({ error: '请输入 RSS 地址' }, 400);

    // 简单 URL 格式验证
    try { new URL(url); } catch {
      return jsonResponse({ error: '无效的 URL 格式' }, 400);
    }

    // 读取现有配置
    const feeds = parseJson(await env.KV.get('config:rss_feeds'), []);

    // 检查重复
    if (feeds.some(f => f.url === url)) {
      return jsonResponse({ error: '该 RSS 源已存在' }, 409);
    }

    // 生成 key
    const key = 'feed_' + Date.now().toString(36);
    const name = new URL(url).hostname.replace('www.', '');

    feeds.push({ key, name, url });
    await env.KV.put('config:rss_feeds', JSON.stringify(feeds));

    return jsonResponse({ success: true, key });
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

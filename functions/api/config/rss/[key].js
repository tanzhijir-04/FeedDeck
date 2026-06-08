// DELETE /api/config/rss/:key — 删除 RSS 源

export async function onRequestDelete(context) {
  const { params, env } = context;
  const key = params.key;

  try {
    const feeds = parseJson(await env.KV.get('config:rss_feeds'), []);
    const filtered = feeds.filter(f => f.key !== key);

    if (filtered.length === feeds.length) {
      return jsonResponse({ error: '未找到该 RSS 源' }, 404);
    }

    await env.KV.put('config:rss_feeds', JSON.stringify(filtered));

    // 同时删除 D1 中该源的数据
    await env.DB.prepare('DELETE FROM feed_items WHERE feed_key = ?').bind(key).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: '删除失败' }, 500);
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

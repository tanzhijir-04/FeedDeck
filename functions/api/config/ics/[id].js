// DELETE /api/config/ics/:id — 删除 ICS 订阅

export async function onRequestDelete(context) {
  const { params, env } = context;
  const id = params.id;

  try {
    const subs = parseJson(await env.KV.get('config:calendar_subs'), []);
    const filtered = subs.filter(s => s.id !== id);

    if (filtered.length === subs.length) {
      return jsonResponse({ error: '未找到该订阅' }, 404);
    }

    await env.KV.put('config:calendar_subs', JSON.stringify(filtered));

    // 删除该来源的日历事件
    await env.DB.prepare(
      "DELETE FROM calendar_events WHERE source LIKE ?"
    ).bind('ics_url:' + id + '%').run();

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

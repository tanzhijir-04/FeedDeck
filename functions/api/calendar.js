// GET /api/calendar — 获取日历事件
// POST /api/calendar — 创建日历事件

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  try {
    let query = 'SELECT id, source, title, description, location, start_time, end_time, all_day FROM calendar_events';
    const conditions = [];
    const vals = [];

    if (from) { conditions.push('start_time >= ?'); vals.push(from); }
    if (to) { conditions.push('start_time <= ?'); vals.push(to); }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY start_time ASC LIMIT 50';

    const rows = await env.DB.prepare(query).bind(...vals).all();
    return jsonResponse({ events: rows.results || [] });
  } catch {
    return jsonResponse({ events: [] });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { title, description, location, start_time, end_time, all_day } = await request.json();
    if (!title || !start_time) return jsonResponse({ error: '请填写标题和开始时间' }, 400);

    const result = await env.DB.prepare(
      `INSERT INTO calendar_events (title, description, location, start_time, end_time, all_day)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(title, description || null, location || null, start_time, end_time || null, all_day ? 1 : 0).run();

    return jsonResponse({ success: true, id: result.meta.last_row_id });
  } catch {
    return jsonResponse({ error: '创建失败' }, 500);
  }
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

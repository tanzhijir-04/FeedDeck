// GET /api/todos — 获取待办列表
// POST /api/todos — 创建待办

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const rows = await env.DB.prepare(
      'SELECT id, title, completed, deadline, created_at FROM todo_items ORDER BY completed ASC, deadline ASC NULLS LAST'
    ).all();
    return jsonResponse({ items: rows.results || [] });
  } catch {
    return jsonResponse({ items: [] });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { title, deadline } = await request.json();
    if (!title) return jsonResponse({ error: '请输入待办内容' }, 400);

    const result = await env.DB.prepare(
      'INSERT INTO todo_items (title, deadline) VALUES (?, ?)'
    ).bind(title, deadline || null).run();

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

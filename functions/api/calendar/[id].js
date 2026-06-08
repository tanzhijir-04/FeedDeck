// PUT /api/calendar/:id — 更新日历事件
// DELETE /api/calendar/:id — 删除日历事件

export async function onRequestPut(context) {
  const { params, request, env } = context;
  const id = parseInt(params.id, 10);

  try {
    const body = await request.json();
    const sets = [];
    const vals = [];

    if (body.title !== undefined) { sets.push('title = ?'); vals.push(body.title); }
    if (body.description !== undefined) { sets.push('description = ?'); vals.push(body.description); }
    if (body.location !== undefined) { sets.push('location = ?'); vals.push(body.location); }
    if (body.start_time !== undefined) { sets.push('start_time = ?'); vals.push(body.start_time); }
    if (body.end_time !== undefined) { sets.push('end_time = ?'); vals.push(body.end_time); }
    if (body.all_day !== undefined) { sets.push('all_day = ?'); vals.push(body.all_day ? 1 : 0); }

    if (sets.length === 0) return jsonResponse({ error: '无更新内容' }, 400);

    sets.push('updated_at = datetime("now")');
    vals.push(id);

    await env.DB.prepare(
      `UPDATE calendar_events SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...vals).run();

    return jsonResponse({ success: true });
  } catch {
    return jsonResponse({ error: '更新失败' }, 500);
  }
}

export async function onRequestDelete(context) {
  const { params, env } = context;
  const id = parseInt(params.id, 10);

  try {
    await env.DB.prepare('DELETE FROM calendar_events WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true });
  } catch {
    return jsonResponse({ error: '删除失败' }, 500);
  }
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

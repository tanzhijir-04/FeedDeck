// PUT /api/todos/:id — 更新待办
// DELETE /api/todos/:id — 删除待办

export async function onRequestPut(context) {
  const { params, request, env } = context;
  const id = parseInt(params.id, 10);

  try {
    const body = await request.json();
    const sets = [];
    const vals = [];

    if (body.title !== undefined) { sets.push('title = ?'); vals.push(body.title); }
    if (body.completed !== undefined) {
      sets.push('completed = ?'); vals.push(body.completed ? 1 : 0);
      if (body.completed) {
        sets.push('completed_at = datetime("now")');
      } else {
        sets.push('completed_at = NULL');
      }
    }
    if (body.deadline !== undefined) { sets.push('deadline = ?'); vals.push(body.deadline); }

    if (sets.length === 0) return jsonResponse({ error: '无更新内容' }, 400);

    vals.push(id);
    await env.DB.prepare(
      `UPDATE todo_items SET ${sets.join(', ')} WHERE id = ?`
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
    await env.DB.prepare('DELETE FROM todo_items WHERE id = ?').bind(id).run();
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

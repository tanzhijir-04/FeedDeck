// GET /api/config/fetch-log — 获取定时任务执行状态
export async function onRequestGet(context) {
  const { env } = context;
  try {
    const rows = await env.DB.prepare(
      'SELECT task_name, last_run_at, last_status FROM fetch_log ORDER BY last_run_at DESC'
    ).all();
    return new Response(JSON.stringify({ logs: rows.results || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({ logs: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

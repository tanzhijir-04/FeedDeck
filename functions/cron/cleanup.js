// Cron: cleanup（每天0点）
// 清理过期数据

export async function onRequestGet(context) {
  const { env } = context;
  const taskName = 'cleanup';

  try {
    // 检查上次执行时间（23 小时冷却期）
    const lastRun = await env.DB.prepare(
      'SELECT last_run_at FROM fetch_log WHERE task_name = ?'
    ).bind(taskName).first();

    const url = new URL(context.request.url);
    const force = url.searchParams.get('force') === '1';
    if (!force && lastRun?.last_run_at) {
      const elapsed = Date.now() - new Date(lastRun.last_run_at).getTime();
      if (elapsed < 23 * 60 * 60 * 1000) return; // 23 小时内不重复
    }
    // 清理 7 天前的热搜数据
    await env.DB.prepare(
      `DELETE FROM hotsearch_items WHERE fetched_at < datetime('now', '-7 days')`
    ).run();

    // 清理 30 天前的 RSS 数据
    await env.DB.prepare(
      `DELETE FROM feed_items WHERE created_at < datetime('now', '-30 days')`
    ).run();

    // 清理已过期的日历事件
    await env.DB.prepare(
      `DELETE FROM calendar_events WHERE end_time IS NOT NULL AND end_time < datetime('now') AND source != 'manual'`
    ).run();

    // 清理过期 session（30 天前）
    await env.DB.prepare(
      `DELETE FROM sessions WHERE expires_at < datetime('now')`
    ).run();

    // 清理 30 天前的天气缓存
    await env.DB.prepare(
      `DELETE FROM weather_cache WHERE fetched_at < datetime('now', '-30 days')`
    ).run();

    // 清理 30 天前的社交数据
    await env.DB.prepare(
      `DELETE FROM social_stats WHERE fetched_at < datetime('now', '-30 days')`
    ).run();

    await env.DB.prepare(
      `INSERT OR REPLACE INTO fetch_log (task_name, last_run_at, last_status)
       VALUES (?, datetime('now'), 'success')`
    ).bind(taskName).run();

  } catch {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO fetch_log (task_name, last_run_at, last_status)
       VALUES (?, datetime('now'), 'error')`
    ).bind(taskName).run().catch(() => {});
  }
}

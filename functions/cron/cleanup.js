// Cron: cleanup（每天0点）
// 清理过期数据

export default {
  async scheduled(event, env) {
    const taskName = 'cleanup';

    try {
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
};

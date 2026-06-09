// GET /api/dashboard
// 聚合所有模块数据，一次返回

export async function onRequestGet(context) {
  const { env } = context;

  try {
    // 并行查询所有数据源
    const [feeds, hotsearch, weather, todos, calendar, social, weatherCity] = await Promise.all([
      getFeeds(env),
      getHotsearch(env),
      getWeather(env),
      getTodos(env),
      getCalendar(env),
      getSocial(env),
  env.KV.get('config:weather_city')
]);

    return new Response(JSON.stringify({
      feeds, hotsearch, weather, todos, calendar, social, weather_city: weatherCity || '北京'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: '获取数据失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// RSS 聚合：每个 feed 最多取 5 条，按时间倒序
async function getFeeds(env) {
  try {
    const rows = await env.DB.prepare(
      `SELECT feed_key, title, link, summary, published_at
       FROM feed_items
       ORDER BY published_at DESC
       LIMIT 20`
    ).all();

    const lastRun = await env.DB.prepare(
      `SELECT last_run_at FROM fetch_log WHERE task_name = 'fetch-feeds'`
    ).first();

    return {
      items: rows.results || [],
      lastUpdated: lastRun?.last_run_at || null
    };
  } catch {
    return { items: [], lastUpdated: null };
  }
}

// 热搜：按平台分组，仅返回已启用的平台
async function getHotsearch(env) {
  try {
    // 读取用户配置的启用平台列表
    let enabledPlatforms = null;
    try {
      const configStr = await env.KV.get('config:hotsearch_platforms');
      if (configStr) enabledPlatforms = JSON.parse(configStr);
    } catch { /* 忽略 */ }

    let rows;
    if (enabledPlatforms && enabledPlatforms.length > 0) {
      // 仅查询启用的平台
      const placeholders = enabledPlatforms.map(() => '?').join(',');
      rows = await env.DB.prepare(
        `SELECT platform, rank, title, url, heat
         FROM hotsearch_items
         WHERE platform IN (${placeholders})
           AND fetched_at = (
             SELECT MAX(fetched_at) FROM hotsearch_items h2
             WHERE h2.platform = hotsearch_items.platform
           )
         ORDER BY platform, rank
         LIMIT 150`
      ).bind(...enabledPlatforms).all();
    } else {
      // 无配置时返回所有平台
      rows = await env.DB.prepare(
        `SELECT platform, rank, title, url, heat
         FROM hotsearch_items
         WHERE fetched_at = (
           SELECT MAX(fetched_at) FROM hotsearch_items h2
           WHERE h2.platform = hotsearch_items.platform
         )
         ORDER BY platform, rank
         LIMIT 150`
      ).all();
    }

    const platforms = {};
    for (const row of (rows.results || [])) {
      if (!platforms[row.platform]) platforms[row.platform] = [];
      platforms[row.platform].push(row);
    }

    const lastRun = await env.DB.prepare(
      `SELECT last_run_at FROM fetch_log WHERE task_name = 'fetch-hotsearch'`
    ).first();

    return {
      platforms,
      enabledPlatforms: enabledPlatforms || [],
      lastUpdated: lastRun?.last_run_at || null
    };
  } catch {
    return { platforms: {}, enabledPlatforms: [], lastUpdated: null };
  }
}

// 天气：取最新缓存
async function getWeather(env) {
  try {
    const row = await env.DB.prepare(
      `SELECT data, fetched_at FROM weather_cache
       ORDER BY fetched_at DESC LIMIT 1`
    ).first();

    return {
      data: row ? JSON.parse(row.data) : null,
      lastUpdated: row?.fetched_at || null
    };
  } catch {
    return { data: null, lastUpdated: null };
  }
}

// 待办：未完成在前
async function getTodos(env) {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, title, completed, deadline, created_at
       FROM todo_items
       ORDER BY completed ASC, deadline ASC NULLS LAST`
    ).all();

    return { items: rows.results || [] };
  } catch {
    return { items: [] };
  }
}

// 日历：今天和未来的事件
async function getCalendar(env) {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, title, start_time, end_time, description, location, all_day, source
       FROM calendar_events
       ORDER BY start_time ASC
       LIMIT 50`
    ).all();

    return { events: rows.results || [] };
  } catch {
    return { events: [] };
  }
}

// 社交：每个平台取最新一条，含配置信息供客户端直连使用
async function getSocial(env) {
  try {
    // 读取配置（含 accountId，供前端 JSONP 使用）
    let socialConfig = [];
    try {
      const configStr = await env.KV.get('config:social_accounts');
      if (configStr) socialConfig = JSON.parse(configStr);
    } catch { /* 忽略 */ }

    const rows = await env.DB.prepare(
      `SELECT platform, account_id, account_name, follower_count, fetched_at
       FROM social_stats
       WHERE fetched_at = (
         SELECT MAX(fetched_at) FROM social_stats s2
         WHERE s2.platform = social_stats.platform
         AND s2.account_id = social_stats.account_id
       )`
    ).all();

    const accounts = {};
    const now = Date.now();
    for (const row of (rows.results || [])) {
      const entry = {
        account_name: row.account_name,
        follower_count: row.follower_count,
        fetched_at: row.fetched_at
      };

      // KV 缓存兜底：D1 数据超过 2 小时，尝试读 KV
      const fetchedTime = new Date(row.fetched_at).getTime();
      if (now - fetchedTime > 2 * 60 * 60 * 1000 && row.account_id) {
        try {
          const cached = await env.KV.get(`cache:social:${row.account_id}`, 'json');
          if (cached && cached.followerCount != null) {
            entry.follower_count = cached.followerCount;
            entry.fetched_at = cached.fetchedAt;
            entry.from_cache = true;
          }
        } catch { /* 忽略 */ }
      }

      accounts[row.platform] = entry;
    }

    const lastRun = await env.DB.prepare(
      `SELECT last_run_at FROM fetch_log WHERE task_name = 'fetch-social'`
    ).first();

    return {
      accounts,
      config: socialConfig,
      lastUpdated: lastRun?.last_run_at || null
    };
  } catch {
    return { accounts: {}, config: [], lastUpdated: null };
  }
}

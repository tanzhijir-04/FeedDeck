// GET /api/config — 获取配置（不含密码）
// PUT /api/config — 更新配置

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const keys = [
      'config:rss_feeds',
      'config:hotsearch_platforms',
      'config:social_accounts',
      'config:weather_city',
      'config:calendar_subs',
      'config:ics_files'
    ];

    const values = await Promise.all(keys.map(k => env.KV.get(k)));

    return new Response(JSON.stringify({
      rss_feeds: parseJson(values[0], []),
      hotsearch_platforms: parseJson(values[1], []),
      social_accounts: parseJson(values[2], []),
      weather_city: values[3] || '北京',
      calendar_subs: parseJson(values[4], []),
      ics_files: parseJson(values[5], [])
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return jsonResponse({ error: '获取配置失败' }, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;

  try {
    const body = await request.json();

    // 逐个更新提供的字段
    const updates = [];
    if (body.rss_feeds !== undefined) {
      updates.push(env.KV.put('config:rss_feeds', JSON.stringify(body.rss_feeds)));
    }
    if (body.hotsearch_platforms !== undefined) {
      updates.push(env.KV.put('config:hotsearch_platforms', JSON.stringify(body.hotsearch_platforms)));
    }
    if (body.social_accounts !== undefined) {
      updates.push(env.KV.put('config:social_accounts', JSON.stringify(body.social_accounts)));
    }
    if (body.weather_city !== undefined) {
      updates.push(env.KV.put('config:weather_city', body.weather_city));
    }
    if (body.calendar_subs !== undefined) {
      updates.push(env.KV.put('config:calendar_subs', JSON.stringify(body.calendar_subs)));
    }
    if (body.ics_files !== undefined) {
      updates.push(env.KV.put('config:ics_files', JSON.stringify(body.ics_files)));
    }

    await Promise.all(updates);

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: '更新配置失败' }, 500);
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

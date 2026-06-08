// Cron: fetch-weather（每30分钟）
// 从 Open-Meteo 获取天气数据

export async function onRequestGet(context) {
  const { env } = context;
  const taskName = 'fetch-weather';
  var totalFetched = 0;

  try {
    const lastRun = await env.DB.prepare(
      'SELECT last_run_at FROM fetch_log WHERE task_name = ?'
    ).bind(taskName).first();

    const url = new URL(context.request.url);
    const force = url.searchParams.get('force') === '1';
    if (!force && lastRun?.last_run_at) {
      const elapsed = Date.now() - new Date(lastRun.last_run_at).getTime();
      if (elapsed < 25 * 60 * 1000) return new Response(JSON.stringify({ success: true, skipped: true, reason: '冷却期未到' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const city = await env.KV.get('config:weather_city');
    console.log('[fetch-weather] city from KV:', city);
    if (!city) return new Response(JSON.stringify({ success: true, skipped: true, reason: '未配置天气城市' }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    // Open-Meteo 地理编码
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`;
    console.log('[fetch-weather] geoUrl:', geoUrl);
    const geoRes = await fetch(geoUrl);
    console.log('[fetch-weather] geoRes status:', geoRes.status);
    if (!geoRes.ok) throw new Error('Geo failed: ' + geoRes.status);
    const geo = await geoRes.json();
    console.log('[fetch-weather] geo results:', geo.results?.length);
    if (!geo.results?.length) throw new Error('City not found: ' + city);

    const { latitude, longitude } = geo.results[0];

    // 获取天气数据
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,moon_phase,moon_illumination` +
      `&timezone=auto&forecast_days=1`;
    console.log('[fetch-weather] weatherUrl:', weatherUrl);
    const weatherRes = await fetch(weatherUrl);
    console.log('[fetch-weather] weatherRes status:', weatherRes.status);
    if (!weatherRes.ok) throw new Error('Weather failed: ' + weatherRes.status);
    const weatherData = await weatherRes.json();
    console.log('[fetch-weather] weatherData keys:', Object.keys(weatherData));

    // 写入缓存
    await env.DB.prepare(
      'INSERT INTO weather_cache (city, data) VALUES (?, ?)'
    ).bind(city, JSON.stringify(weatherData)).run();
    totalFetched = 1;
    console.log('[fetch-weather] SUCCESS, wrote to DB');

    // 清理旧缓存（保留 7 天）
    await env.DB.prepare(
      `DELETE FROM weather_cache WHERE fetched_at < datetime('now', '-7 days')`
    ).run();

    await env.DB.prepare(
      `INSERT OR REPLACE INTO fetch_log (task_name, last_run_at, last_status)
       VALUES (?, datetime('now'), 'success')`
    ).bind(taskName).run();

  } catch (e) {
    console.error('[fetch-weather] ERROR:', e.message, e.stack);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO fetch_log (task_name, last_run_at, last_status)
       VALUES (?, datetime('now'), 'error')`
    ).bind(taskName).run().catch(() => {});
  }

  return new Response(JSON.stringify({ success: true, fetched: totalFetched }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

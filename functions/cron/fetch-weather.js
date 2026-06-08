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
    if (!city) return new Response(JSON.stringify({ success: true, skipped: true, reason: '未配置天气城市' }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    // Open-Meteo 地理编码
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`
    );
    if (!geoRes.ok) throw new Error('Geo failed');
    const geo = await geoRes.json();
    if (!geo.results?.length) throw new Error('City not found');

    const { latitude, longitude } = geo.results[0];

    // 获取天气数据（注意：moon_phase/moon_illumination 已被 Open-Meteo 废弃）
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code,uv_index` +
      `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset` +
      `&timezone=auto&forecast_days=1`
    );
    if (!weatherRes.ok) throw new Error('Weather failed');
    const weatherData = await weatherRes.json();

    // 获取空气质量数据
    let aqiData = null;
    try {
      const aqiRes = await fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}` +
        `&current=european_aqi&timezone=auto`
      );
      if (aqiRes.ok) {
        aqiData = await aqiRes.json();
      }
    } catch {}

    // 合并AQI到天气数据
    if (aqiData?.current) {
      weatherData.current.european_aqi = aqiData.current.european_aqi;
    }

    // 写入缓存
    await env.DB.prepare(
      'INSERT INTO weather_cache (city, data) VALUES (?, ?)'
    ).bind(city, JSON.stringify(weatherData)).run();
    totalFetched = 1;

    // 清理旧缓存（保留 7 天）
    await env.DB.prepare(
      `DELETE FROM weather_cache WHERE fetched_at < datetime('now', '-7 days')`
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

  return new Response(JSON.stringify({ success: true, fetched: totalFetched }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

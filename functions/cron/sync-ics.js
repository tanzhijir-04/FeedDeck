// Cron: sync-ics（每15分钟）
// 同步 ICS 日历订阅

export async function onRequestGet(context) {
  const { env } = context;
  const taskName = 'sync-ics';

  try {
    const lastRun = await env.DB.prepare(
      'SELECT last_run_at FROM fetch_log WHERE task_name = ?'
    ).bind(taskName).first();

    const url = new URL(context.request.url);
    const force = url.searchParams.get('force') === '1';
    if (!force && lastRun?.last_run_at) {
      const elapsed = Date.now() - new Date(lastRun.last_run_at).getTime();
      if (elapsed < 10 * 60 * 1000) return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const subsStr = await env.KV.get('config:calendar_subs');
    if (!subsStr) return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const subs = JSON.parse(subsStr);
    if (!subs.length) return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const results = await Promise.allSettled(
      subs.map(sub => syncOneIcs(sub, env.DB))
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO fetch_log (task_name, last_run_at, last_status)
       VALUES (?, datetime('now'), ?)`
    ).bind(taskName, successCount > 0 ? 'success' : 'error').run();

  } catch {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO fetch_log (task_name, last_run_at, last_status)
       VALUES (?, datetime('now'), 'error')`
    ).bind(taskName).run().catch(() => {});
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function syncOneIcs(sub, db) {
  const res = await fetch(sub.url, {
    headers: { 'User-Agent': 'FeedDeck/1.0' }
  });
  if (!res.ok) return;

  const text = await res.text();
  const events = parseICS(text);
  const source = 'ics_url:' + sub.id;

  // 先删除该来源的旧事件
  await db.prepare('DELETE FROM calendar_events WHERE source = ?').bind(source).run();

  if (events.length === 0) return;

  // 批量插入
  const stmts = events.map(evt =>
    db.prepare(
      `INSERT INTO calendar_events (source, uid, title, description, location, start_time, end_time, all_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(source, evt.uid, evt.title, evt.description, evt.location, evt.start, evt.end, evt.allDay ? 1 : 0)
  );

  await db.batch(stmts);
}

// 简易 ICS 解析器
function parseICS(text) {
  const events = [];
  const blocks = text.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];
    if (!block) continue;

    const uid = extractICSField(block, 'UID');
    const title = extractICSField(block, 'SUMMARY') || '无标题';
    const description = extractICSField(block, 'DESCRIPTION');
    const location = extractICSField(block, 'LOCATION');
    const dtstart = extractICSField(block, 'DTSTART');
    const dtend = extractICSField(block, 'DTEND');

    if (!dtstart) continue;

    const allDay = dtstart.length === 8; // YYYYMMDD 格式 = 全天事件

    events.push({
      uid,
      title: unescapeICS(title),
      description: description ? unescapeICS(description) : null,
      location: location ? unescapeICS(location) : null,
      start: parseICSDate(dtstart),
      end: dtend ? parseICSDate(dtend) : null,
      allDay
    });
  }

  return events;
}

function extractICSField(text, field) {
  const re = new RegExp(field + '[;:][^\\r\\n]*', 'i');
  const m = text.match(re);
  if (!m) return null;

  // 处理多行值（以空格或 tab 开头的续行）
  let value = m[0].replace(/^.*?:(.*)$/, '$1').trim();

  // 检查续行
  const fullRe = new RegExp(field + '[;:][^\\r\\n]*\\r?\\n([ \\t][^\\r\\n]*)*', 'i');
  const fullM = text.match(fullRe);
  if (fullM) {
    value = fullM[0].replace(/^.*?:(.*)/m, '$1').replace(/\r?\n[ \t]/g, '').trim();
  }

  return value;
}

function parseICSField(field) {
  return field.replace(/^.*?:(.*)/, '$1').trim();
}

function unescapeICS(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\\\/g, '\\');
}

function parseICSDate(str) {
  // YYYYMMDDTHHMMSS or YYYYMMDD
  if (str.length === 8) {
    return `${str.slice(0,4)}-${str.slice(4,6)}-${str.slice(6,8)}`;
  }
  return `${str.slice(0,4)}-${str.slice(4,6)}-${str.slice(6,8)}T${str.slice(9,11)}:${str.slice(11,13)}:${str.slice(13,15)}`;


}

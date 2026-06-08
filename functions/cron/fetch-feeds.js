// Cron: fetch-feeds（每5分钟）
// 抓取所有 RSS/Atom 源，写入 D1

export async function onRequestGet(context) {
  const { env } = context;
  const taskName = 'fetch-feeds';

  try {
    // 检查上次执行时间（防止重复）
    const lastRun = await env.DB.prepare(
      'SELECT last_run_at FROM fetch_log WHERE task_name = ?'
    ).bind(taskName).first();

    if (lastRun?.last_run_at) {
      const elapsed = Date.now() - new Date(lastRun.last_run_at).getTime();
      if (elapsed < 4 * 60 * 1000) return; // 4 分钟内不重复执行
    }

    // 获取 RSS 源列表
    const feedsStr = await env.KV.get('config:rss_feeds');
    if (!feedsStr) return;
    const feeds = JSON.parse(feedsStr);
    if (!feeds.length) return;

    // 并行抓取所有源
    const results = await Promise.allSettled(
      feeds.map(feed => fetchFeed(feed, env.DB))
    );

    // 记录执行状态
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
}

async function fetchFeed(feed, db) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'FeedDeck/1.0' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const text = await res.text();
    const items = parseFeed(text);

    // 限制每源 20 条
    const limited = items.slice(0, 20);

    if (limited.length === 0) return;

    // 批量插入（使用事务）
    const stmts = limited.map(item =>
      db.prepare(
        `INSERT INTO feed_items (feed_key, title, link, summary, published_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(feed.key, item.title, item.link, item.summary, item.publishedAt)
    );

    await db.batch(stmts);

    // 清理旧数据（保留 30 天）
    await db.prepare(
      `DELETE FROM feed_items WHERE feed_key = ? AND created_at < datetime('now', '-30 days')`
    ).bind(feed.key).run();

  } catch {
    // clearTimeout already called in try block
  }
}

// 简易 RSS/Atom 解析
function parseFeed(xml) {
  const items = [];

  // RSS 2.0: <item>
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const item of rssItems) {
    items.push({
      title: extractTag(item, 'title'),
      link: extractTag(item, 'link') || extractAttr(item, 'link', 'href'),
      summary: extractTag(item, 'description') || extractTag(item, 'summary'),
      publishedAt: extractTag(item, 'pubDate') || extractTag(item, 'published') || extractTag(item, 'updated')
    });
  }

  // Atom: <entry>
  if (items.length === 0) {
    const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const entry of entries) {
      items.push({
        title: extractTag(entry, 'title'),
        link: extractAttr(entry, 'link', 'href'),
        summary: extractTag(entry, 'summary') || extractTag(entry, 'content'),
        publishedAt: extractTag(entry, 'published') || extractTag(entry, 'updated')
      });
    }
  }

  return items;
}

function extractTag(str, tag) {
  const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
  const m = str.match(re);
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : null;
}

function extractAttr(str, tag, attr) {
  const re = new RegExp('<' + tag + '[^>]*' + attr + '=["\']([^"\']*)["\']', 'i');
  const m = str.match(re);
  return m ? m[1].trim() : null;
}

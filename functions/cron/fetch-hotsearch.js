// Cron: fetch-hotsearch（每5分钟）
// 抓取各平台热搜数据

export async function onRequestGet(context) {
  const { env } = context;
  const taskName = 'fetch-hotsearch';

  try {
    const lastRun = await env.DB.prepare(
      'SELECT last_run_at FROM fetch_log WHERE task_name = ?'
    ).bind(taskName).first();

    const url = new URL(context.request.url);
    const force = url.searchParams.get('force') === '1';
    if (!force && lastRun?.last_run_at) {
      const elapsed = Date.now() - new Date(lastRun.last_run_at).getTime();
      if (elapsed < 4 * 60 * 1000) return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 获取启用的平台
    const platformsStr = await env.KV.get('config:hotsearch_platforms');
    if (!platformsStr) return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const platforms = JSON.parse(platformsStr);
    if (!platforms.length) return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    // 并行抓取所有平台
    const fetchers = {
      weibo: fetchWeibo,
      zhihu: fetchZhihu,
      bilibili: fetchBilibili,
      douyin: fetchDouyin,
      baidu: fetchBaidu,
      toutiao: fetchToutiao,
      github: fetchGithub,
      reddit: fetchReddit
    };

    const results = await Promise.allSettled(
      platforms.map(p => {
        const fn = fetchers[p];
        return fn ? fn(env.DB) : Promise.resolve();
      })
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

// --- 各平台抓取器 ---

async function fetchWeibo(db) {
  try {
    const res = await fetch('https://weibo.com/ajax/side/hotSearch', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return;
    const json = await res.json();
    const list = (json.data?.realtime || []).slice(0, 20);

    const stmts = list.map((item, i) =>
      db.prepare(
        `INSERT INTO hotsearch_items (platform, rank, title, url, heat)
         VALUES (?, ?, ?, ?, ?)`
      ).bind('weibo', i + 1, item.note || item.word, '', item.num?.toString() || '')
    );

    if (stmts.length) await db.batch(stmts);

    // 清理 7 天前数据
    await db.prepare(
      `DELETE FROM hotsearch_items WHERE platform = 'weibo' AND fetched_at < datetime('now', '-7 days')`
    ).run();
  } catch {}
}

async function fetchZhihu(db) {
  try {
    const res = await fetch('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return;
    const json = await res.json();
    const list = (json.data || []).slice(0, 20);

    const stmts = list.map((item, i) =>
      db.prepare(
        `INSERT INTO hotsearch_items (platform, rank, title, url, heat)
         VALUES (?, ?, ?, ?, ?)`
      ).bind('zhihu', i + 1, item.target?.title || '', '', item.detail_text || '')
    );

    if (stmts.length) await db.batch(stmts);
    await db.prepare(
      `DELETE FROM hotsearch_items WHERE platform = 'zhihu' AND fetched_at < datetime('now', '-7 days')`
    ).run();
  } catch {}
}

async function fetchBilibili(db) {
  try {
    const res = await fetch('https://api.bilibili.com/x/web-interface/search/square?limit=20', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return;
    const json = await res.json();
    const list = (json.data?.trending?.list || []).slice(0, 20);

    const stmts = list.map((item, i) =>
      db.prepare(
        `INSERT INTO hotsearch_items (platform, rank, title, url, heat)
         VALUES (?, ?, ?, ?, ?)`
      ).bind('bilibili', i + 1, item.keyword || '', '', item.heat_score?.toString() || '')
    );

    if (stmts.length) await db.batch(stmts);
    await db.prepare(
      `DELETE FROM hotsearch_items WHERE platform = 'bilibili' AND fetched_at < datetime('now', '-7 days')`
    ).run();
  } catch {}
}

async function fetchDouyin(db) {
  // 抖音热搜需要特殊处理，这里用备用接口
  try {
    const res = await fetch('https://www.douyin.com/aweme/v1/web/hot/search/list/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return;
    const json = await res.json();
    const list = (json.data?.word_list || []).slice(0, 20);

    const stmts = list.map((item, i) =>
      db.prepare(
        `INSERT INTO hotsearch_items (platform, rank, title, url, heat)
         VALUES (?, ?, ?, ?, ?)`
      ).bind('douyin', i + 1, item.word || '', '', item.hot_value?.toString() || '')
    );

    if (stmts.length) await db.batch(stmts);
    await db.prepare(
      `DELETE FROM hotsearch_items WHERE platform = 'douyin' AND fetched_at < datetime('now', '-7 days')`
    ).run();
  } catch {}
}

async function fetchBaidu(db) {
  try {
    const res = await fetch('https://top.baidu.com/board?tab=realtime', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return;
    const text = await res.text();

    // 简易提取热搜标题
    const titles = [];
    const re = /class="c-single-text-ellipsis"[^>]*>([^<]+)</g;
    let m;
    while ((m = re.exec(text)) && titles.length < 20) {
      titles.push(m[1].trim());
    }

    const stmts = titles.map((title, i) =>
      db.prepare(
        `INSERT INTO hotsearch_items (platform, rank, title, url, heat)
         VALUES (?, ?, ?, ?, ?)`
      ).bind('baidu', i + 1, title, '', '')
    );

    if (stmts.length) await db.batch(stmts);
    await db.prepare(
      `DELETE FROM hotsearch_items WHERE platform = 'baidu' AND fetched_at < datetime('now', '-7 days')`
    ).run();
  } catch {}
}

async function fetchToutiao(db) {
  try {
    const res = await fetch('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return;
    const json = await res.json();
    const list = (json.data || []).slice(0, 20);

    const stmts = list.map((item, i) =>
      db.prepare(
        `INSERT INTO hotsearch_items (platform, rank, title, url, heat)
         VALUES (?, ?, ?, ?, ?)`
      ).bind('toutiao', i + 1, item.Title || '', '', item.HotValue?.toString() || '')
    );

    if (stmts.length) await db.batch(stmts);
    await db.prepare(
      `DELETE FROM hotsearch_items WHERE platform = 'toutiao' AND fetched_at < datetime('now', '-7 days')`
    ).run();
  } catch {}
}

async function fetchGithub(db) {
  try {
    const res = await fetch('https://api.github.com/search/repositories?q=created:>=' + getDateNDaysAgo(1) + '&sort=stars&order=desc&per_page=15', {
      headers: { 'User-Agent': 'FeedDeck/1.0', 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return;
    const json = await res.json();

    const stmts = (json.items || []).map((item, i) =>
      db.prepare(
        `INSERT INTO hotsearch_items (platform, rank, title, url, heat)
         VALUES (?, ?, ?, ?, ?)`
      ).bind('github', i + 1, item.full_name, item.html_url, item.stargazers_count?.toString() + ' stars')
    );

    if (stmts.length) await db.batch(stmts);
    await db.prepare(
      `DELETE FROM hotsearch_items WHERE platform = 'github' AND fetched_at < datetime('now', '-7 days')`
    ).run();
  } catch {}
}

async function fetchReddit(db) {
  try {
    const res = await fetch('https://www.reddit.com/r/popular/hot.json?limit=15', {
      headers: { 'User-Agent': 'FeedDeck/1.0' }
    });
    if (!res.ok) return;
    const json = await res.json();
    const posts = (json.data?.children || []).slice(0, 15);

    const stmts = posts.map((post, i) =>
      db.prepare(
        `INSERT INTO hotsearch_items (platform, rank, title, url, heat)
         VALUES (?, ?, ?, ?, ?)`
      ).bind('reddit', i + 1, post.data?.title || '', 'https://reddit.com' + (post.data?.permalink || ''), post.data?.score?.toString() || '')
    );

    if (stmts.length) await db.batch(stmts);
    await db.prepare(
      `DELETE FROM hotsearch_items WHERE platform = 'reddit' AND fetched_at < datetime('now', '-7 days')`
    ).run();
  } catch {}
}

function getDateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];


}

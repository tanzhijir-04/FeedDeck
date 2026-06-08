// Cron: fetch-hotsearch（每5分钟）
// 抓取各平台热搜数据
// API 方案参考：https://github.com/ourongxing/newsnow

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export async function onRequestGet(context) {
  const { env } = context;
  const taskName = 'fetch-hotsearch';
  var totalFetched = 0;

  try {
    const lastRun = await env.DB.prepare(
      'SELECT last_run_at FROM fetch_log WHERE task_name = ?'
    ).bind(taskName).first();

    const url = new URL(context.request.url);
    const force = url.searchParams.get('force') === '1';
    if (!force && lastRun?.last_run_at) {
      const elapsed = Date.now() - new Date(lastRun.last_run_at).getTime();
      if (elapsed < 4 * 60 * 1000) return new Response(JSON.stringify({ success: true, skipped: true, reason: '冷却期未到' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 获取启用的平台
    const platformsStr = await env.KV.get('config:hotsearch_platforms');
    if (!platformsStr) return new Response(JSON.stringify({ success: true, skipped: true, reason: '未配置热搜平台' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const platforms = JSON.parse(platformsStr);
    if (!platforms.length) return new Response(JSON.stringify({ success: true, skipped: true, reason: '未配置热搜平台' }), { status: 200, headers: { 'Content-Type': 'application/json' } });

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
        return fn ? fn(env.DB) : Promise.resolve(0);
      })
    );

    results.forEach(r => {
      if (r.status === 'fulfilled' && typeof r.value === 'number') totalFetched += r.value;
    });

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

  return new Response(JSON.stringify({ success: true, fetched: totalFetched }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// --- 辅助：批量写入 + 清理旧数据 ---

async function batchInsert(db, platform, items) {
  if (!items.length) return 0;
  const stmts = items.map(item =>
    db.prepare(
      `INSERT INTO hotsearch_items (platform, rank, title, url, heat)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(platform, item.rank, item.title, item.url || '', item.heat || '')
  );
  await db.batch(stmts);
  await db.prepare(
    `DELETE FROM hotsearch_items WHERE platform = ? AND fetched_at < datetime('now', '-7 days')`
  ).bind(platform).run();
  return stmts.length;
}

// --- 微博 ---
// 主接口：weibo.com AJAX API（无需 cookie）
// 备用：s.weibo.com HTML 抓取（需 cookie，更稳定但脆弱）

async function fetchWeibo(db) {
  try {
    const res = await fetch('https://weibo.com/ajax/side/hotSearch', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data?.realtime || []).slice(0, 20);
    if (!list.length) return 0;

    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.note || item.word || '',
      url: item.word ? 'https://s.weibo.com/weibo?q=' + encodeURIComponent(item.word) : '',
      heat: item.num?.toString() || ''
    }));

    return await batchInsert(db, 'weibo', items);
  } catch { return 0; }
}

// --- 知乎 ---
// 使用 -web 端点，字段路径更稳定（参考 newsnow）

async function fetchZhihu(db) {
  try {
    const res = await fetch('https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit=20&desktop=true', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data || []).slice(0, 20);
    if (!list.length) return 0;

    const items = list.map((item, i) => {
      const target = item.target || {};
      const titleArea = target.title_area || {};
      const metricsArea = target.metrics_area || {};
      const link = target.link || {};
      return {
        rank: i + 1,
        title: titleArea.text || target.title || '',
        url: link.url || '',
        heat: metricsArea.text || ''
      };
    });

    return await batchInsert(db, 'zhihu', items);
  } catch { return 0; }
}

// --- B站 ---
// 使用 hotword 端点，返回 show_name（显示名）+ keyword（搜索词）（参考 newsnow）

async function fetchBilibili(db) {
  try {
    const res = await fetch('https://s.search.bilibili.com/main/hotword?limit=30', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.top_list || []).slice(0, 20);
    if (!list.length) return 0;

    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.show_name || item.keyword || '',
      url: item.keyword ? 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(item.keyword) : '',
      heat: item.heat_score ? String(item.heat_score) : ''
    }));

    return await batchInsert(db, 'bilibili', items);
  } catch { return 0; }
}

// --- 抖音 ---
// 需要先获取 cookie（参考 newsnow），否则 API 返回空

async function fetchDouyin(db) {
  try {
    // 第一步：获取抖音 cookie
    const cookieRes = await fetch('https://login.douyin.com/', {
      headers: { 'User-Agent': UA },
      redirect: 'manual'
    });
    const setCookies = cookieRes.headers.getSetCookie?.() || [];
    const cookie = setCookies.map(c => c.split(';')[0]).join('; ');

    // 第二步：带 cookie 请求热搜
    const res = await fetch(
      'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1',
      {
        headers: {
          'User-Agent': UA,
          'Cookie': cookie
        }
      }
    );
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data?.word_list || []).slice(0, 20);
    if (!list.length) return 0;

    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.word || '',
      url: item.sentence_id ? 'https://www.douyin.com/hot/' + item.sentence_id : '',
      heat: item.hot_value?.toString() || ''
    }));

    return await batchInsert(db, 'douyin', items);
  } catch { return 0; }
}

// --- 百度 ---
// 从 SSR 嵌入的 <!--s-data:...--> 提取结构化 JSON（参考 newsnow）
// 比 HTML class 正则更稳定，且自带 URL 和置顶标记

async function fetchBaidu(db) {
  try {
    const res = await fetch('https://top.baidu.com/board?tab=realtime', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const text = await res.text();

    // 提取嵌入的 SSR JSON
    const match = text.match(/<!--s-data:(.*?)-->/s);
    if (!match) return 0;
    const data = JSON.parse(match[1]);
    const content = data?.cards?.[0]?.content || [];
    if (!content.length) return 0;

    // 过滤置顶广告，取前 20 条
    const filtered = content.filter(item => !item.isTop).slice(0, 20);

    const items = filtered.map((item, i) => ({
      rank: i + 1,
      title: item.word || '',
      url: item.rawUrl ? 'https://' + item.rawUrl : '',
      heat: item.hotScore ? String(item.hotScore) : ''
    }));

    return await batchInsert(db, 'baidu', items);
  } catch { return 0; }
}

// --- 今日头条 ---
// 同一 API，补充 URL 构造

async function fetchToutiao(db) {
  try {
    const res = await fetch('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data || []).slice(0, 20);
    if (!list.length) return 0;

    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.Title || '',
      url: item.ClusterIdStr ? 'https://www.toutiao.com/trending/' + item.ClusterIdStr + '/' : '',
      heat: item.HotValue?.toString() || ''
    }));

    return await batchInsert(db, 'toutiao', items);
  } catch { return 0; }
}

// --- GitHub Trending ---
// 抓取 github.com/trending 页面（真正的热门项目，而非 Search API 的新项目）

async function fetchGithub(db) {
  try {
    const res = await fetch('https://github.com/trending', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const text = await res.text();

    // 用正则从 HTML 中提取 trending 仓库
    // 每个仓库在 <article> 标签中，<h2> 里有 <a href="/owner/repo">
    const items = [];
    const repoRe = /href="\/([^"]+)"[^>]*>\s*\1\s*<\/a>/g;
    const articleRe = /<article class="Box-row">([\s\S]*?)<\/article>/g;
    let articleMatch;

    while ((articleMatch = articleRe.exec(text)) && items.length < 15) {
      const block = articleMatch[1];

      // 提取仓库名（/owner/repo 格式）
      const repoMatch = block.match(/href="\/([^"]+)"[^>]*>\s*<[^>]+>\s*<[^>]+>\s*([^<]+)/);
      if (!repoMatch) continue;
      const repoPath = repoMatch[1].trim();
      const repoName = repoMatch[2].trim() || repoPath;

      // 提取 star 数
      const starMatch = block.match(/href="\/[^"]+\/stargazers"[^>]*>\s*(?:<[^>]+>)*\s*([\d,]+)/);
      const stars = starMatch ? starMatch[1].replace(/,/g, '') : '';

      items.push({
        rank: items.length + 1,
        title: repoPath,
        url: 'https://github.com/' + repoPath,
        heat: stars ? stars + ' stars' : ''
      });
    }

    // 如果 article 正则没匹配到，用更宽松的方式
    if (!items.length) {
      const linkRe = /class="[^"]*repo[^"]*"[^>]*href="\/([^"]+)"/g;
      let m;
      while ((m = linkRe.exec(text)) && items.length < 15) {
        items.push({
          rank: items.length + 1,
          title: m[1],
          url: 'https://github.com/' + m[1],
          heat: ''
        });
      }
    }

    return await batchInsert(db, 'github', items);
  } catch { return 0; }
}

// --- Reddit ---
// 保持原有实现，newsnow 未覆盖此平台

async function fetchReddit(db) {
  try {
    const res = await fetch('https://www.reddit.com/r/popular/hot.json?limit=15', {
      headers: { 'User-Agent': 'FeedDeck/1.0' }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const posts = (json.data?.children || []).slice(0, 15);
    if (!posts.length) return 0;

    const items = posts.map((post, i) => ({
      rank: i + 1,
      title: post.data?.title || '',
      url: post.data?.permalink ? 'https://reddit.com' + post.data.permalink : '',
      heat: post.data?.score?.toString() || ''
    }));

    return await batchInsert(db, 'reddit', items);
  } catch { return 0; }
}

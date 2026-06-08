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
      reddit: fetchReddit,
      cls: fetchCls,
      '36kr': fetch36kr,
      ithome: fetchIthome,
      juejin: fetchJuejin,
      v2ex: fetchV2ex,
      hackernews: fetchHackernews,
      zhihudaily: fetchZhihudaily,
      thepaper: fetchThepaper,
      qqnews: fetchQqnews,
      ifeng: fetchIfeng,
      netease: fetchNetease,
      hupu: fetchHupu,
      douban: fetchDouban,
      steam: fetchSteam,
      sspai: fetchSspai
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
// 使用 s.weibo.com HTML 页面 + 硬编码 cookie（参考 newsnow）
// cookie 来源：https://github.com/v5tech/weibo-trending-hot-search

async function fetchWeibo(db) {
  try {
    const res = await fetch('https://s.weibo.com/top/summary?cate=realtimehot', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Cookie': 'SUB=_2AkMWIuNSf8NxqwJRmP8dy2rhaoV2ygrEieKgfhKJJRMxHRl-yT9jqk86tRB6PaLNvQZR6zYUcYVT1zSjoSreQHidcUq7',
        'Referer': 'https://s.weibo.com/top/summary?cate=realtimehot'
      }
    });
    if (!res.ok) return 0;
    const text = await res.text();

    // 从 HTML 中提取热搜项：href="/weibo?q=...&band_rank=N" >标题</a>
    const items = [];
    const re = /href="\/weibo\?q=[^"]*(?:band_rank=(\d+))[^"]*"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(text)) && items.length < 20) {
      const rank = parseInt(m[1], 10) || items.length + 1;
      const title = m[2].trim();
      if (!title) continue;
      items.push({
        rank,
        title,
        url: 'https://s.weibo.com' + m[0].match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&'),
        heat: ''
      });
    }

    // 备用：如果 band_rank 正则没匹配，用更宽松的方式
    if (!items.length) {
      const linkRe = /href="(\/weibo\?q=[^"]+)"[^>]*>([^<]+)<\/a>/g;
      let m2;
      while ((m2 = linkRe.exec(text)) && items.length < 20) {
        const title = m2[2].trim();
        if (!title) continue;
        items.push({
          rank: items.length + 1,
          title,
          url: 'https://s.weibo.com' + m2[1].replace(/&amp;/g, '&'),
          heat: ''
        });
      }
    }

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

    const items = [];
    // GitHub trending 结构：repo 链接格式为 href="/owner/repo" data-view-component="true" class="Link"
    // 关键特征：class="Link" 后紧跟 <svg（repo 图标），过滤掉用户头像链接
    const repoLinks = text.match(/href="\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+"\s+data-view-component="true"\s+class="Link"><svg[^>]+class="octicon octicon-repo/g) || [];
    const seen = new Set();
    for (const link of repoLinks) {
      const match = link.match(/href="\/([^"]+)"/);
      if (!match) continue;
      const repoPath = match[1];
      if (seen.has(repoPath)) continue;
      seen.add(repoPath);
      items.push({
        rank: items.length + 1,
        title: repoPath,
        url: 'https://github.com/' + repoPath,
        heat: ''
      });
      if (items.length >= 15) break;
    }

    // 补充 star 数：从 stargazers 链接中提取
    const starLinks = text.match(/href="\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/stargazers"[\s\S]*?<\/a>/g) || [];
    for (const starLink of starLinks) {
      const repoPath = starLink.match(/href="\/([^/]+\/[^/]+)\/stargazers"/)?.[1];
      const starText = starLink.match(/>\s*([\d,]+)\s*<\/a>/);
      if (repoPath && starText) {
        const item = items.find(i => i.title === repoPath);
        if (item) item.heat = starText[1] + ' stars';
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

// ===== 以下为 NewsNow 风格新增平台 =====

// --- 财联社 CLS ---
async function fetchCls(db) {
  try {
    const res = await fetch('https://www.cls.cn/api/sw?app=CailianpressWeb&os=web&sv=8.4.6', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data?.roll_data || []).slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.title || item.content || '',
      url: item.shareurl || '',
      heat: item.read_count?.toString() || ''
    }));
    return await batchInsert(db, 'cls', items);
  } catch { return 0; }
}

// --- 36氪 ---
async function fetch36kr(db) {
  try {
    const res = await fetch('https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_id: 'wap', param: { siteId: 1, platformId: 2 } })
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data?.hotRankList || json.data?.itemList || []).slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.templateMaterial?.widgetTitle || item.title || '',
      url: item.itemId ? 'https://36kr.com/p/' + item.itemId : '',
      heat: ''
    }));
    return await batchInsert(db, '36kr', items);
  } catch { return 0; }
}

// --- IT之家 ---
async function fetchIthome(db) {
  try {
    const res = await fetch('https://m.ithome.com/api/news/newslistpageget?categoryid=0&dt=0&startid=0&pagesize=20', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.Result || []).slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.title || '',
      url: item.url || item.link || '',
      heat: item.commentcount?.toString() || ''
    }));
    return await batchInsert(db, 'ithome', items);
  } catch { return 0; }
}

// --- 掘金 ---
async function fetchJuejin(db) {
  try {
    const res = await fetch('https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot&count=20&from=0', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data || []).slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.content?.title || '',
      url: item.content?.content_id ? 'https://juejin.cn/post/' + item.content.content_id : '',
      heat: item.content_counter?.hot_rank?.toString() || ''
    }));
    return await batchInsert(db, 'juejin', items);
  } catch { return 0; }
}

// --- V2EX ---
async function fetchV2ex(db) {
  try {
    const res = await fetch('https://www.v2ex.com/api/topics/hot.json', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    if (!Array.isArray(json)) return 0;
    const items = json.slice(0, 20).map((item, i) => ({
      rank: i + 1,
      title: item.title || '',
      url: item.url || '',
      heat: item.replies?.toString() || ''
    }));
    return await batchInsert(db, 'v2ex', items);
  } catch { return 0; }
}

// --- Hacker News ---
async function fetchHackernews(db) {
  try {
    const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const ids = await res.json();
    if (!Array.isArray(ids)) return 0;
    const top20 = ids.slice(0, 20);
    const stories = await Promise.all(
      top20.map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { headers: { 'User-Agent': UA } }).then(r => r.json()).catch(() => null))
    );
    const items = stories.filter(Boolean).map((item, i) => ({
      rank: i + 1,
      title: item.title || '',
      url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      heat: item.score?.toString() || ''
    }));
    return await batchInsert(db, 'hackernews', items);
  } catch { return 0; }
}

// --- 知乎日报 ---
async function fetchZhihudaily(db) {
  try {
    const res = await fetch('https://news-at.zhihu.com/api/4/news/latest', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.stories || []).slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.title || '',
      url: item.share_url || `https://daily.zhihu.com/story/${item.id}`,
      heat: ''
    }));
    return await batchInsert(db, 'zhihudaily', items);
  } catch { return 0; }
}

// --- 澎湃新闻 ---
async function fetchThepaper(db) {
  try {
    const res = await fetch('https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data?.hotNews || []).slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.name || item.title || '',
      url: item.contId ? 'https://www.thepaper.cn/newsDetail_forward_' + item.contId : '',
      heat: item.praiseTimes?.toString() || ''
    }));
    return await batchInsert(db, 'thepaper', items);
  } catch { return 0; }
}

// --- 腾讯新闻 ---
async function fetchQqnews(db) {
  try {
    const res = await fetch('https://i.news.qq.com/trpc.qqnews_web.kv_srv.kv_srv_http/list?sub_srv_id=24hours&srv_id=pc&offset=0&limit=20&strategy=1&ext=%7B%22pool%22%3A%5B%22top%22%5D%2C%22Is498%22%3Atrue%7D', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data?.list || []).slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.title || '',
      url: item.url || '',
      heat: item.read_count?.toString() || ''
    }));
    return await batchInsert(db, 'qqnews', items);
  } catch { return 0; }
}

// --- 凤凰新闻 ---
async function fetchIfeng(db) {
  try {
    const res = await fetch('https://news.ifeng.com/shanklist/toutiao/pc_0490201010/1-1-20-0.html', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data?.list || []).slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.title || '',
      url: item.url || '',
      heat: item.comments?.toString() || ''
    }));
    return await batchInsert(db, 'ifeng', items);
  } catch { return 0; }
}

// --- 网易新闻 ---
async function fetchNetease(db) {
  try {
    const res = await fetch('https://m.163.com/fe/api/hot/news/flow?size=20', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data?.list || []).slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.title || '',
      url: item.skipURL || item.url || '',
      heat: item.commentCount?.toString() || ''
    }));
    return await batchInsert(db, 'netease', items);
  } catch { return 0; }
}

// --- 虎扑 ---
async function fetchHupu(db) {
  try {
    const res = await fetch('https://bbs.hupu.com/all-gambia', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const text = await res.text();
    const items = [];
    const re = /class="p-title"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(text)) && items.length < 20) {
      const title = m[2].trim();
      if (!title) continue;
      items.push({ rank: items.length + 1, title, url: m[1].startsWith('http') ? m[1] : 'https://bbs.hupu.com' + m[1], heat: '' });
    }
    return await batchInsert(db, 'hupu', items);
  } catch { return 0; }
}

// --- 豆瓣 ---
async function fetchDouban(db) {
  try {
    const res = await fetch('https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&page_limit=20&page_start=0', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.subjects || []).slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.title || '',
      url: item.url || '',
      heat: item.rate || ''
    }));
    return await batchInsert(db, 'douban', items);
  } catch { return 0; }
}

// --- Steam ---
async function fetchSteam(db) {
  try {
    const res = await fetch('https://store.steampowered.com/api/featuredcategories', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const specials = json?.specials?.items || [];
    const list = specials.slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.name || '',
      url: item.id ? 'https://store.steampowered.com/app/' + item.id : '',
      heat: item.discount_percent ? '-' + item.discount_percent + '%' : ''
    }));
    return await batchInsert(db, 'steam', items);
  } catch { return 0; }
}

// --- 少数派 SSPAI ---
async function fetchSspai(db) {
  try {
    const res = await fetch('https://sspai.com/api/v1/articles?offset=0&limit=20&type=recommend_to_home&sort=recommend_count_at_home', {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const list = (json.data || []).slice(0, 20);
    if (!list.length) return 0;
    const items = list.map((item, i) => ({
      rank: i + 1,
      title: item.title || '',
      url: item.slug ? 'https://sspai.com/post/' + item.slug : '',
      heat: item.like_count?.toString() || ''
    }));
    return await batchInsert(db, 'sspai', items);
  } catch { return 0; }
}

// --- 今日头条热榜 (toutiao 已有，此为备用热搜接口) ---
// --- 微博热搜备用：使用 newsnow 的移动端接口 ---
async function fetchWeiboMobile(db) {
  try {
    const res = await fetch('https://m.weibo.cn/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot', {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' }
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const cards = json.data?.cards || [];
    const items = [];
    for (const card of cards) {
      const group = card.card_group || [];
      for (const item of group) {
        if (items.length >= 20) break;
        const desc = item.desc || '';
        if (!desc) continue;
        items.push({
          rank: items.length + 1,
          title: desc,
          url: item.scheme || '',
          heat: item.desc_extr || ''
        });
      }
      if (items.length >= 20) break;
    }
    return await batchInsert(db, 'weibo', items);
  } catch { return 0; }
}

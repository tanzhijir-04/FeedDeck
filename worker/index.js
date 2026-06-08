// FeedDeck 定时任务调度 Worker
// 这个 Worker 负责触发 Pages Functions 中的 cron 任务

const PAGES_URL = 'https://feeddeck.pages.dev';

export default {
  async scheduled(event, env, ctx) {
    const tasks = [
      { path: '/cron/fetch-feeds', name: 'RSS 聚合' },
      { path: '/cron/fetch-hotsearch', name: '热搜抓取' },
      { path: '/cron/fetch-weather', name: '天气查询' },
      { path: '/cron/fetch-social', name: '社交数据' },
      { path: '/cron/sync-ics', name: 'ICS 同步' },
      { path: '/cron/cleanup', name: '数据清理' }
    ];

    const results = await Promise.allSettled(
      tasks.map(task => fetch(`${PAGES_URL}${task.path}`, {
        method: 'GET',
        headers: { 'User-Agent': 'FeedDeck-Worker/1.0' }
      }))
    );

    const success = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
    const failed = results.length - success;

    console.log(`FeedDeck cron: ${success} succeeded, ${failed} failed`);
  }
};

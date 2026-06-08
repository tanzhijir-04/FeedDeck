// Cron: fetch-social（每30分钟）
// 获取社交媒体粉丝数据
//
// B站已迁移到客户端直连（JSONP），不再由 Worker 抓取
// 此 cron 仅保留为未来其他平台的预留接口

export async function onRequestGet(context) {
  const { env } = context;
  const taskName = 'fetch-social';

  // B站已迁移到客户端直连，跳过服务端抓取
  return new Response(JSON.stringify({
    success: true,
    skipped: true,
    reason: 'B站已迁移到客户端直连，其他平台预留接口'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

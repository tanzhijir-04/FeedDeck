# FeedDeck 项目指南

## 项目概述
FeedDeck 是一个个人信息流仪表板，部署在 Cloudflare 上，运行在 iPad mini 2/3（768x1024 竖屏）Safari 中，作为电脑副屏常亮显示。

## 分工原则（严格遵守）
1. **Codex**：只写提示词、规划、文档，不写代码
2. **Claude Code**：写所有实现代码（前端 + 后端 + 配置）
3. **Google Stitch**：设计前端 UI 样式

## 实现原则（最简单导向）
- 前端：纯 HTML/CSS/JS，无框架，兼容 iOS 12 Safari
- 后端：Cloudflare Pages Functions + D1 + KV
- 能用原生 API 解决的，不引入第三方库
- 能用 50 行代码搞定的，不写 200 行
- 每次只做一个功能模块，做完验证再做下一个

## 目录结构
`
prompts/            # Codex 生成的提示词
superpowers/specs/  # 设计文档和规格说明
src/                # 前端静态文件（HTML/CSS/JS）
functions/          # Cloudflare Pages Functions（API + 定时任务）
migrations/         # D1 数据库迁移 SQL
`

## 部署方式（GitHub + Cloudflare Pages）
1. 代码推送到 GitHub 仓库
2. Cloudflare Dashboard → Pages → 连接 GitHub 仓库
3. 推送代码后 Cloudflare 自动构建部署
4. D1 数据库和 KV 命名空间在 Cloudflare Dashboard 创建
5. 环境变量在 Cloudflare Dashboard 的 Pages 项目设置中配置

### 首次部署步骤
1. 在 Cloudflare Dashboard 创建 Pages 项目
2. 创建 D1 数据库：wrangler d1 create feeddeck-db，记录 database ID
3. 创建 KV 命名空间：wrangler kv:namespace create CONFIG，记录 namespace ID
4. 在 Pages 项目设置中配置环境变量：D1_DATABASE_ID、KV_NAMESPACE_ID
5. 在 Pages 项目设置中绑定 D1 和 KV（Settings → Functions → D1/KV bindings）

## 设计文档位置
- 主设计文档：superpowers/specs/2026-06-07-feeddeck-design.md
- 前端设计提示词：prompts/frontend-design-prompt.md

## Git 仓库
https://github.com/tanzhijir-04/FeedDeck.git

## 开发流程
1. 每完成一个功能模块，立即 commit
2. commit message 格式：feat: xxx 或 fix: xxx 或 chore: xxx
3. push 到 GitHub 后 Cloudflare 自动部署

## 当前进度
- [ ] 项目脚手架
- [ ] 认证系统
- [ ] 前端骨架
- [ ] RSS 聚合模块
- [ ] 热搜榜模块
- [ ] 天气模块
- [ ] 待办模块
- [ ] 配置页
- [ ] 定时任务

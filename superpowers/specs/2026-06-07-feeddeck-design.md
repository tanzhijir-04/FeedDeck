# FeedDeck - iPad 信息流副屏仪表板 设计文档

## 1. 项目概述

FeedDeck 是一个部署在 Cloudflare 上的个人信息流仪表板，运行在 iPad mini 2/3（iOS 12）的 Safari 中，作为电脑旁边的副屏常亮显示。用户打开页面输入密码后，即可看到实时更新的新闻、热搜、天气、待办等信息。

### 1.1 目标用户
- 单用户（作者本人）

### 1.2 目标设备
- iPad mini 2/3，屏幕分辨率 768x1024（竖屏）
- Safari on iOS 12.5.x

### 1.3 技术约束
- Cloudflare 免费额度：Pages Functions（即 Workers）10 万请求/天，D1 10 万写/天 + 500 万读/天，Pages 无限制
- 前端不使用任何 JS 框架，纯 HTML/CSS/JS（确保老 Safari 兼容）
- 后端使用 Cloudflare Pages Functions（底层即 Workers）+ D1（SQLite）

---

## 2. 技术架构

### 2.1 整体架构

```
iPad Safari
    │
    ├── GET /           → 登录页 / 主仪表板
    ├── GET /c          → 配置页
    └── GET /api/*      → 后端 API
            │
    Cloudflare Pages Functions（API 层 \+ 定时任务，与前端同域，无需 CORS）
            │
    Cloudflare D1（主数据库）
    Cloudflare KV（仅存配置项和密码）
    Cloudflare Pages（静态前端托管）
```

### 2.2 技术选型说明

| 组件 | 选型 | 理由 |
|------|------|------|
| 前端托管 | Cloudflare Pages | 免费，全球 CDN |
| API 层 | Cloudflare Pages Functions | 免费额度充足，支持 cron 定时触发 |
| 主数据库 | Cloudflare D1 | 10 万写/天，适合频繁更新的缓存数据 |
| 配置存储 | Cloudflare KV | 配置项写入极少，KV 简单够用 |
| 认证 | 密码 + Cookie Session | 轻量，不需要第三方服务 |

### 2.3 为什么不全用 KV

KV 免费每天只有 1000 次写入。热搜、RSS、天气等数据定时刷新，写入频率远超此限额。D1 免费 10 万次写入/天，完全满足需求。KV 仅用于几乎不写入的配置数据和密码哈希。

---

## 3. 功能模块

### 3.1 认证系统

- 打开任何页面先跳转登录页，输入密码
- 密码使用 Web Crypto API（SHA-256）哈希后存入 KV
- 登录成功后生成随机 session token，存入 D1（带过期时间），通过 HttpOnly Secure SameSite=Strict cookie 传递
- Session 默认有效期 30 天
- 配置页（/c）同样需要认证

### 3.2 新闻/RSS 聚合（v1）

- 用户在配置页添加 RSS/Atom 源（URL + 自定义名称）
- Pages Functions cron 每 5 分钟抓取一次所有订阅源
- 抓取结果存入 D1（feed_items 表），每条带 pubDate 时间戳
- 前端通过 `/api/dashboard` 获取最新数据
- 展示：来源标签、标题、摘要（截断）、发布时间、点击跳转原文
- 每个源最多保留最新 20 条

### 3.3 热搜榜（v1）

- 支持平台：微博、知乎、抖音、百度、今日头条、B站、GitHub Trending、Reddit
- 每个平台做成独立模块，有统一接口规范
- 用户在配置页勾选启用哪些平台
- Pages Functions cron 每 5 分钟抓取一次
- 抓取结果存入 D1（hotsearch_items 表）
- 展示：排名、标题、热度值、点击跳转
- 每个平台展示前 15-20 条
- 单平台抓取失败不影响其他平台，显示"暂无数据"

### 3.4 社交媒体数据（v2）

- 支持平台：B站、YouTube、Twitter/X 等
- 用户在配置页勾选平台 + 填入账号 ID/URL
- Pages Functions cron 每 30 分钟抓取一次（频率低于热搜，避免触发平台限流）
- 抓取结果存入 D1（social_stats 表）
- 展示：平台图标、账号名、粉丝数、最近变化趋势（如有）
- 单平台失败不影响其他模块

### 3.5 天气（v1）

- 用户在配置页填入城市名
- 使用免费天气 API（如 Open-Meteo，无需 API key）
- Pages Functions cron 每 30 分钟抓取一次
- 抓取结果存入 D1（weather_cache 表）
- 展示：当前温度、天气图标、今日高低温、未来几小时预报

### 3.6 日历/日程（v2）

**数据来源三种：**
1. **ICS URL 订阅** — 用户在配置页粘贴 ICS 链接，Pages Functions cron 每 15 分钟同步一次，解析 VEVENT 写入 D1
2. **ICS 文件上传** — 配置页上传 .ics 文件，解析后写入 D1
3. **手动创建** — 在日历模块直接新建/编辑/删除事件

**存储：** D1（calendar_events 表）

**展示：** 今日和未来 7 天的日程列表，按时间排序，即将到来的事件高亮

### 3.7 待办提醒（v1）

- 在仪表板上直接添加/完成/删除待办项
- 可设置截止时间（可选）
- 存入 D1（todo_items 表）
- 展示：待办列表，已过期未完成的高亮标红
- 数据通过配置页或主页面操作均可

### 3.8 扩展模块框架（v2+）

- 预留模块注册机制，后续新增模块只需：
  1. 后端新增一个 fetcher 函数
  2. D1 新增一张缓存表（或复用通用表）
  3. 前端新增一个 card 组件
- 模块之间互不影响

---

## 4. 数据库设计

### 4.1 D1 表结构

```sql
-- RSS 订阅源配置（实际配置存 KV，这里存抓取结果）
CREATE TABLE feed_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_key TEXT NOT NULL,        -- 对应 KV 中的 feed 配置 key
  title TEXT NOT NULL,
  link TEXT,
  summary TEXT,
  published_at TEXT,             -- ISO 8601
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_feed_items_key ON feed_items(feed_key, published_at DESC);

-- 热搜数据
CREATE TABLE hotsearch_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,        -- weibo / zhihu / douyin / ...
  rank INTEGER,
  title TEXT NOT NULL,
  url TEXT,
  heat TEXT,                     -- 热度值（字符串，各平台格式不同）
  fetched_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_hotsearch_platform ON hotsearch_items(platform, fetched_at DESC);

-- 社交媒体数据
CREATE TABLE social_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,        -- bilibili / youtube / twitter
  account_id TEXT NOT NULL,
  account_name TEXT,
  follower_count INTEGER,
  fetched_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_social_account ON social_stats(platform, account_id, fetched_at DESC);

-- 天气缓存
CREATE TABLE weather_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  data TEXT NOT NULL,            -- JSON 完整天气数据
  fetched_at TEXT DEFAULT (datetime('now'))
);

-- 日历事件
CREATE TABLE calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT DEFAULT 'manual',  -- manual / ics_url:{subId} / ics_file:{fileId}
  uid TEXT,                      -- ICS UID（去重用）
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_time TEXT NOT NULL,      -- ISO 8601
  end_time TEXT,
  all_day INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_calendar_start ON calendar_events(start_time);

-- 待办事项
CREATE TABLE todo_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  deadline TEXT,                 -- ISO 8601，可选
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX idx_todo_pending ON todo_items(completed, deadline);

-- Session 存储
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- 定时任务状态（记录上次抓取时间，避免重复抓取）
CREATE TABLE fetch_log (
  task_name TEXT PRIMARY KEY,
  last_run_at TEXT,
  last_status TEXT               -- success / error
);
```

### 4.2 KV 结构

```
Key                          Value
─────────────────────────────────────────────
config:password              SHA-256 哈希（hex）
config:auth_salt             用于哈希的盐值
config:dashboard             仪表板全局配置 JSON
config:rss_feeds             RSS 源列表 JSON [{key, name, url}]
config:hotsearch_platforms   启用的热搜平台列表 JSON
config:social_accounts       社交账号列表 JSON [{platform, accountId, name}]
config:weather_city          天气城市名
config:calendar_subs         ICS 订阅列表 JSON [{id, name, url}]
config:ics_files             上传的 ICS 文件列表 JSON [{id, name}]
```

---

## 5. API 设计

### 5.1 认证相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录，提交密码，返回 session cookie |
| POST | /api/auth/logout | 登出，删除 session |
| GET | /api/auth/check | 检查是否已登录 |

### 5.2 仪表板数据（合并端点）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/dashboard | 一次性返回所有模块的最新数据 |

响应结构：
```json
{
  "feeds": { "items": [...], "lastUpdated": "..." },
  "hotsearch": { "platforms": { "weibo": [...], "zhihu": [...] }, "lastUpdated": "..." },
  "weather": { "data": {...}, "lastUpdated": "..." },
  "todos": { "items": [...] },
  "calendar": { "events": [...] },
  "social": { "accounts": { "bilibili": {...}, "youtube": {...} }, "lastUpdated": "..." }
}
```

### 5.3 配置管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/config | 获取所有配置 |
| PUT | /api/config | 更新配置（整体替换或部分更新） |
| POST | /api/config/rss | 添加 RSS 源 |
| DELETE | /api/config/rss/:key | 删除 RSS 源 |
| POST | /api/config/ics-upload | 上传 .ics 文件 |
| DELETE | /api/config/ics-file/:id | 删除已上传的 ICS 文件 |
| PUT | /api/config/password | 修改密码 |

### 5.4 待办 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/todos | 获取所有待办 |
| POST | /api/todos | 新建待办 |
| PUT | /api/todos/:id | 更新待办（标题、完成状态、截止时间） |
| DELETE | /api/todos/:id | 删除待办 |

### 5.5 日历 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/calendar | 获取日程（支持 ?from=&to= 时间范围查询） |
| POST | /api/calendar | 新建事件 |
| PUT | /api/calendar/:id | 编辑事件 |
| DELETE | /api/calendar/:id | 删除事件 |

---

## 6. 定时任务（Cron Triggers）

| 任务 | 频率 | 说明 |
|------|------|------|
| fetch-feeds | 每 5 分钟 | 抓取所有 RSS 源，写入 D1 |
| fetch-hotsearch | 每 5 分钟 | 抓取所有启用的热搜平台，写入 D1 |
| fetch-weather | 每 30 分钟 | 抓取天气数据，写入 D1 |
| fetch-social | 每 30 分钟 | 抓取社交媒体数据，写入 D1 |
| sync-ics | 每 15 分钟 | 同步所有 ICS 订阅源，解析写入 D1 |
| cleanup | 每天一次 | 清理过期数据（保留最近 7 天的热搜、30 天的 RSS、过期的日历事件） |

所有 fetch 任务遵循统一模式：
1. 检查 fetch_log 判断是否需要执行（防止重复）
2. 并行抓取所有数据源（Promise.all）
3. 仅在数据有变化时写入 D1（减少写入量）
4. 记录执行结果到 fetch_log
5. 单个源失败不中断其他源的处理

---

## 7. 前端设计要求

### 7.1 设计目标设备
- iPad mini 2/3 竖屏：768 x 1024 px
- 以竖屏为唯一设计尺寸，不做响应式

### 7.2 视觉风格
- 深色模式为默认主题，可切换浅色
- 信息密度高但不拥挤，适合扫视
- 每个功能模块是一个卡片（card），卡片之间有明确间距
- 卡片标题使用小号粗体，内容区域紧凑
- 避免装饰性元素，一切服务于信息展示效率

### 7.3 页面结构

**登录页：** 简洁的密码输入框 + 登录按钮，居中显示

**主仪表板：** 网格布局，卡片按模块排列
- 顶部固定栏：当前时间、日期、天气摘要、刷新状态指示
- 主体区域：2-3 列网格，各模块卡片按优先级排列
- 卡片可滚动（内容超出时卡片内部滚动，不影响整体布局）

**配置页（/c）：** 表单式界面
- 左侧导航菜单（模块列表）
- 右侧配置表单
- 每个模块有独立的配置区块

### 7.4 模块卡片规格

| 模块 | 卡片内容 | 交互 |
|------|----------|------|
| RSS 聚合 | 来源标签 + 标题 + 摘要截断 + 时间 | 点击标题跳转原文（新标签页） |
| 热搜榜 | 排名序号 + 标题 + 热度 + 平台图标 | 点击跳转平台页面 |
| 天气 | 天气图标 + 温度 + 高低温 + 预报 | 无 |
| 待办 | 勾选框 + 标题 + 截止时间 | 勾选完成、点击编辑、滑动删除 |
| 日历 | 事件标题 + 时间 + 来源标签 | 点击查看详情 |
| 社交媒体 | 平台图标 + 账号名 + 粉丝数 | 无 |

### 7.5 自动刷新
- 前端每 30 秒调用 `/api/dashboard` 获取最新数据
- 页面右上角显示刷新状态（绿色圆点 = 正常，黄色 = 数据较旧，红色 = 请求失败）
- 数据时间戳显示"X 分钟前"

---

## 8. 安全设计

- 所有 API 端点和页面路由均需验证 session cookie
- 密码使用 salt + SHA-256 哈希存储
- Session token 为 32 字节随机数（crypto.getRandomValues）
- Cookie 设置：HttpOnly, Secure, SameSite=Strict
- Session 过期自动清理（由 cleanup 任务处理）
- 不暴露任何内部错误信息给前端，统一返回通用错误提示

---

## 9. 分期实现计划

### v1（核心功能）
1. 项目脚手架 + Cloudflare 部署配置
2. 认证系统（登录/登出/session）
3. 前端骨架（仪表板布局 + 配置页骨架）
4. RSS 聚合模块
5. 热搜榜模块
6. 天气模块
7. 待办模块
8. 配置页（RSS 管理 + 热搜平台勾选 + 天气城市 + 密码修改）
9. 定时任务 + D1 表初始化

### v2（扩展功能）
1. 社交媒体数据模块
2. 日历/ICS 模块（URL 订阅 + 文件上传 + 手动 CRUD）
3. 配置页补全（社交媒体管理 + 日历管理）
4. 扩展模块框架

### v3（增强）
1. Service Worker 离线缓存
2. 深色/浅色主题切换
3. 数据刷新频率可配置
4. 卡片布局拖拽自定义（可选）

---

## 10. 部署说明

- 前端静态文件和 API 通过 `wrangler pages deploy` 统一部署到 Cloudflare Pages（API 路由放在 Pages Functions 的 `functions/` 目录下）
- API 通过 Cloudflare Pages Functions 部署（Pages 项目自带，无需单独部署）
- D1 数据库通过 `wrangler d1 create` 创建，初始化 SQL 通过 migration 文件管理
- KV 命名空间通过 `wrangler kv:namespace create` 创建
- 环境变量（KV namespace ID, D1 database ID）配置在 `wrangler.toml` 中
- 项目根目录需要 `wrangler.toml` 配置文件













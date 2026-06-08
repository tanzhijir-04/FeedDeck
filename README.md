# FeedDeck

个人信息流仪表板，部署在 Cloudflare 上，运行在 iPad mini（768x1024）Safari 中作为电脑副屏常亮显示。

## 功能模块

| 模块 | 说明 | 更新频率 |
|------|------|---------|
| RSS 订阅 | 聚合多个 RSS/Atom 源 | 每 5 分钟 |
| 热搜追踪 | 微博/知乎/B站/抖音/百度/头条/GitHub/Reddit | 每 5 分钟 |
| 天气查询 | Open-Meteo 免费 API，无需 Key | 每 30 分钟 |
| 待办事项 | 增删改查，支持截止日期 | 实时 |
| 日历日程 | ICS 订阅 + 手动添加 | 每 15 分钟 |
| 社交媒体 | B站/YouTube/X 粉丝数据 | 每 30 分钟 |

## 技术栈

- **前端**：纯 HTML/CSS/JS，无框架，兼容 iOS 12 Safari
- **后端**：Cloudflare Pages Functions（Workers 运行时）
- **数据库**：D1（SQLite on Edge）
- **配置存储**：KV（键值对）
- **定时任务**：Cloudflare Cron Triggers
- **主题**：暗/亮模式自动切换（跟随系统 prefers-color-scheme）

## 项目结构

```
FeedDeck/
├── src/                          # 前端静态文件
│   ├── index.html                # 登录页
│   ├── dashboard.html            # 主仪表盘（iPad 挂机页）
│   ├── config.html               # 配置中心
│   ├── css/base.css              # 共享样式 + 设计 Token
│   └── js/
│       ├── api.js                # API 客户端封装
│       └── app.js                # 共享工具函数
├── functions/                    # Cloudflare Pages Functions
│   ├── _middleware.js            # Auth 中间件
│   ├── api/
│   │   ├── auth/                 # 登录/登出/验证
│   │   ├── config.js             # 配置读写
│   │   ├── config/               # RSS/ICS/密码子端点
│   │   ├── dashboard.js          # 仪表盘聚合数据
│   │   ├── todos.js              # 待办 CRUD
│   │   └── calendar.js           # 日历 CRUD
│   └── cron/                     # 定时任务
│       ├── fetch-feeds.js        # RSS 抓取
│       ├── fetch-hotsearch.js    # 热搜抓取（8 平台）
│       ├── fetch-weather.js      # 天气获取
│       ├── fetch-social.js       # 社交媒体数据
│       ├── sync-ics.js           # ICS 日历同步
│       └── cleanup.js            # 过期数据清理
├── migrations/
│   └── 0001_init.sql             # D1 数据库建表语句
├── wrangler.toml                 # Cloudflare 配置
├── CLAUDE.md                     # 项目开发指南
└── README.md
```

---

## Cloudflare 部署指南（纯网页操作）

全部在 Cloudflare Dashboard 完成，无需安装任何 CLI 工具。

### 前置条件

1. 注册 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费套餐即可）
2. 代码已推送到 GitHub 仓库：`https://github.com/tanzhijir-04/FeedDeck.git`

---

### 第一步：创建 D1 数据库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单点击 **Workers & Pages**
3. 左侧菜单找到 **D1 SQL 数据库**，点击进入
4. 点击 **创建数据库**
5. 数据库名称输入：`feeddeck-db`
6. 点击 **创建数据库**
7. 创建完成后，在数据库详情页可以看到 **数据库 ID**，复制保存备用

### 第二步：创建 KV 命名空间

1. 左侧菜单找到 **Workers KV**
2. 点击 **创建命名空间**
3. 命名空间名称输入：`CONFIG`
4. 点击 **添加命名空间**
5. 创建完成后，复制 **命名空间 ID**，保存备用

### 第三步：初始化数据库表

1. 进入 **D1 SQL 数据库** -> 点击 `feeddeck-db`
2. 点击 **控制台** tab
3. 将下面的 SQL 全部粘贴到控制台中，点击 **执行**

```sql
CREATE TABLE IF NOT EXISTS feed_items (id INTEGER PRIMARY KEY AUTOINCREMENT, feed_key TEXT NOT NULL, title TEXT NOT NULL, link TEXT, summary TEXT, published_at TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_feed_items_key ON feed_items(feed_key, published_at DESC);

CREATE TABLE IF NOT EXISTS hotsearch_items (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, rank INTEGER, title TEXT NOT NULL, url TEXT, heat TEXT, fetched_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_hotsearch_platform ON hotsearch_items(platform, fetched_at DESC);

CREATE TABLE IF NOT EXISTS social_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, account_id TEXT NOT NULL, account_name TEXT, follower_count INTEGER, fetched_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_social_account ON social_stats(platform, account_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS weather_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, city TEXT NOT NULL, data TEXT NOT NULL, fetched_at TEXT DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT DEFAULT 'manual', uid TEXT, title TEXT NOT NULL, description TEXT, location TEXT, start_time TEXT NOT NULL, end_time TEXT, all_day INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_time);

CREATE TABLE IF NOT EXISTS todo_items (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, completed INTEGER DEFAULT 0, deadline TEXT, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT);
CREATE INDEX IF NOT EXISTS idx_todo_pending ON todo_items(completed, deadline);

CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created_at TEXT DEFAULT (datetime('now')), expires_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS fetch_log (task_name TEXT PRIMARY KEY, last_run_at TEXT, last_status TEXT);
```

4. 执行后应该看到成功提示
5. 验证：在控制台输入 `SELECT name FROM sqlite_master WHERE type='table';` 并执行，应该看到 8 张表

### 第四步：创建 Pages 项目并连接 GitHub

1. 左侧菜单点击 **Workers & Pages**
2. 点击 **创建应用程序** -> **Pages** tab
3. 点击 **连接到 Git**
4. 授权 Cloudflare 访问你的 GitHub 账号
5. 选择仓库 `tanzhijir-04/FeedDeck`
6. 构建设置：
   - **生产分支**：`main`
   - **构建命令**：留空（不填）
   - **构建输出目录**：`src`
7. 点击 **保存并部署**
8. 等待部署完成（通常 1-2 分钟），会得到一个 `https://feeddeck.pages.dev` 的 URL

### 第五步：绑定 D1 和 KV

1. 进入刚创建的 Pages 项目
2. 点击 **设置** tab -> **函数**
3. 向下滚动找到 **D1 数据库绑定**，点击 **添加绑定**：
   - 变量名称：`DB`
   - D1 数据库：选择 `feeddeck-db`
4. 向下滚动找到 **KV 命名空间绑定**，点击 **添加绑定**：
   - 变量名称：`KV`
   - KV 命名空间：选择 `CONFIG`
5. 点击 **保存**

### 第六步：配置定时任务

1. 在 Pages 项目设置中，找到 **函数** -> **定时器**
2. 依次添加以下触发器：

| Cron 表达式 | 说明 |
|-------------|------|
| `*/5 * * * *` | RSS 抓取 + 热搜追踪 |
| `*/15 * * * *` | ICS 日历同步 |
| `*/30 * * * *` | 天气查询 + 社交数据 |
| `0 0 * * *` | 每日数据清理 |

> 免费套餐限制最多 3 个定时触发器。如果需要全部 4 个，可以把 `*/15` 的任务合并到 `*/5` 的 handler 里。

### 第七步：设置初始密码

首次访问前，需要在 KV 中手动写入密码数据：

1. 进入 **Workers KV** -> 点击 `CONFIG` 命名空间
2. 点击 **查看数据**
3. 点击 **添加条目**

**添加条目 1 — 密码盐**：
- 键：`config:auth_salt`
- 值：`feeddeck-init-salt`（任意字符串，记住即可）
- 点击保存

**添加条目 2 — 密码哈希**：

需要先生成密码的 SHA-256 哈希（在浏览器中操作）：

1. 打开任意网页（或 feeddeck.pages.dev）
2. 按 F12 打开开发者工具 -> Console
3. 输入以下命令（将 `你的密码` 替换为真实密码）：

```javascript
crypto.subtle.digest('SHA-256', new TextEncoder().encode('你的密码feeddeck-init-salt'))
  .then(buf => console.log(Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')))
```

4. 复制输出的 64 位十六进制字符串
5. 回到 KV 控制台，键输入 `config:password`，值粘贴刚才的哈希字符串，保存

> 密码验证流程：客户端发送 `SHA256(密码)`，服务端计算 `SHA256(收到的值 + 盐)` 与 KV 中存储的值比对。

### 第八步：访问验证

1. 打开 `https://feeddeck.pages.dev`
2. 应该看到登录页面
3. 输入密码登录
4. 登录成功后进入主仪表盘（暗色主题 6 卡片网格）
5. 点击任意卡片的设置图标进入配置中心
6. 尝试添加 RSS 源、切换热搜平台开关等操作

### 部署完成后的管理

| 操作 | 在哪里做 |
|------|---------|
| 查看 Functions 日志 | Pages 项目 -> **函数** -> **日志** |
| 查看定时任务执行状态 | D1 控制台 -> 查看 `fetch_log` 表 |
| 修改密码 | KV 控制台 -> 更新 `config:password` 和 `config:auth_salt`（改盐后需重新算哈希） |
| 修改天气城市 | KV 控制台 -> 更新 `config:weather_city` |
| 添加 RSS 源 | 通过配置中心网页操作，或 KV 控制台编辑 `config:rss_feeds` |
| 查看用量 | Cloudflare Dashboard 首页 -> **用量** |

---

## 本地开发

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 启动本地开发服务器
wrangler pages dev src/

# 或绑定远程资源测试
wrangler pages dev src/ --d1=DB/feeddeck-db --kv=CONFIG --remote
```

默认在 `http://localhost:8788` 启动。

---

## API 文档

所有 `/api/*` 端点需要 `fd_session` cookie（login 和 check 除外）。

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录，body: `{ password: "<sha256>" }` |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/check` | 验证登录状态 |

### 仪表盘

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dashboard` | 聚合所有模块数据 |

### 配置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 获取全部配置 |
| PUT | `/api/config` | 更新配置 |
| POST | `/api/config/rss` | 添加 RSS 源，body: `{ url }` |
| DELETE | `/api/config/rss/:key` | 删除 RSS 源 |
| POST | `/api/config/ics` | 添加 ICS 订阅，body: `{ url }` |
| DELETE | `/api/config/ics/:id` | 删除 ICS 订阅 |
| PUT | `/api/config/password` | 修改密码，body: `{ old_password, new_password }` |

### 待办

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/todos` | 获取待办列表 |
| POST | `/api/todos` | 创建待办，body: `{ title, deadline? }` |
| PUT | `/api/todos/:id` | 更新待办，body: `{ title?, completed?, deadline? }` |
| DELETE | `/api/todos/:id` | 删除待办 |

### 日历

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/calendar?from=&to=` | 获取日历事件 |
| POST | `/api/calendar` | 创建事件 |
| PUT | `/api/calendar/:id` | 更新事件 |
| DELETE | `/api/calendar/:id` | 删除事件 |

---

## Cloudflare 免费额度

| 资源 | 免费额度 | 本项目预估用量 |
|------|---------|---------------|
| Pages 部署 | 无限 | - |
| Pages 带宽 | 无限 | - |
| Functions 请求 | 100,000 次/天 | ~2,000 次/天 |
| D1 读取 | 5,000,000 次/天 | ~5,000 次/天 |
| D1 写入 | 100,000 次/天 | ~500 次/天 |
| KV 读取 | 100,000 次/天 | ~1,000 次/天 |
| KV 写入 | 1,000 次/天 | ~50 次/天 |

---

## 安全说明

- 密码在客户端通过 SHA-256 哈希后发送，服务端二次哈希比对
- Session cookie 设置 HttpOnly、Secure、SameSite=Strict
- Session 有效期 30 天，过期自动清理
- 修改密码后所有现有 session 自动失效
- 所有 API 错误返回通用消息，不暴露内部细节

---

## License

MIT

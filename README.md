# FeedDeck

个人信息流仪表板，部署在 Cloudflare 上，运行在 iPad mini（768×1024）Safari 中作为电脑副屏常亮显示。

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
- **主题**：暗/亮模式自动切换（跟随系统 `prefers-color-scheme`）

## 项目结构

```
FeedDeck/
├── src/                          # 前端静态文件
│   ├── index.html                # 登录页
│   ├── dashboard.html            # 主仪表盘（iPad 挂机页）
│   ├── config.html               # 配置中心
│   ├── css/
│   │   └── base.css              # 共享样式 + 设计 Token
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

## Cloudflare 部署指南

### 前置条件

1. 注册 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费套餐即可）
2. 安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

```bash
npm install -g wrangler

# 登录 Cloudflare
wrangler login
```

3. 代码已推送到 GitHub 仓库：`https://github.com/tanzhijir-04/FeedDeck.git`

### 第一步：创建 D1 数据库

```bash
# 在项目根目录执行
wrangler d1 create feeddeck-db
```

执行后会输出类似：

```
✅ Successfully created DB 'feeddeck-db'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**复制 `database_id` 的值**，后面要用。

### 第二步：创建 KV 命名空间

```bash
wrangler kv:namespace create CONFIG
```

执行后会输出类似：

```
✅ Successfully created KV namespace 'CONFIG'
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**复制 `id` 的值**，后面要用。

### 第三步：配置 wrangler.toml

打开项目根目录的 `wrangler.toml`，替换两个占位符：

```toml
[[d1_databases]]
binding = "DB"
database_name = "feeddeck-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # ← 替换为第一步的值

[[kv_namespaces]]
binding = "KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # ← 替换为第二步的值
```

提交并推送：

```bash
git add wrangler.toml
git commit -m "chore: 配置 D1 和 KV 绑定"
git push
```

### 第四步：初始化数据库

```bash
wrangler d1 execute feeddeck-db --remote --file=migrations/0001_init.sql
```

验证表是否创建成功：

```bash
wrangler d1 execute feeddeck-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

应该看到 8 张表：`feed_items`、`hotsearch_items`、`social_stats`、`weather_cache`、`calendar_events`、`todo_items`、`sessions`、`fetch_log`。

### 第五步：创建 Cloudflare Pages 项目

#### 方式 A：通过 Dashboard（推荐）

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages**
2. 点击 **Create application** → **Pages** tab → **Connect to Git**
3. 选择你的 GitHub 仓库 `tanzhijir-04/FeedDeck`
4. 构建设置：
   - **Build command**：留空（纯静态文件，无需构建）
   - **Build output directory**：`src`
5. 点击 **Save and Deploy**

#### 方式 B：通过 Wrangler CLI

```bash
wrangler pages project create feeddeck
wrangler pages deploy src --project-name=feeddeck
```

### 第六步：绑定 D1 和 KV

部署成功后，需要在 Dashboard 中绑定数据库和 KV：

1. 打开 **Cloudflare Dashboard** → **Workers & Pages** → 选择你的 Pages 项目
2. 进入 **Settings** → **Functions**
3. 找到 **D1 database bindings**，点击 **Add binding**：
   - Variable name：`DB`
   - D1 database：选择 `feeddeck-db`
4. 找到 **KV namespace bindings**，点击 **Add binding**：
   - Variable name：`KV`
   - KV namespace：选择 `CONFIG`
5. 保存

### 第七步：配置定时任务

Cloudflare Pages 的 Cron Triggers 需要在 Dashboard 中配置：

1. 进入 Pages 项目 → **Settings** → **Functions** → **Cron Triggers**
2. 添加以下触发器：

| Cron 表达式 | 说明 |
|-------------|------|
| `*/5 * * * *` | RSS + 热搜抓取 |
| `*/15 * * * *` | ICS 日历同步 |
| `*/30 * * * *` | 天气 + 社交数据 |
| `0 0 * * *` | 每日数据清理 |

> **注意**：免费套餐支持最多 3 个 Cron Triggers。可以合并频率相同的任务到一个 handler 中处理。

### 第八步：首次访问

1. 打开你的 Pages 项目 URL（例如 `https://feeddeck.pages.dev`）
2. 首次访问会看到登录页面
3. **设置密码**：目前需要通过 API 手动设置初始密码

```bash
# 使用 Wrangler 直接操作 KV 设置初始密码
# 先生成密码的 SHA-256 哈希（可以用浏览器控制台）
# 在浏览器中打开 https://feeddeck.pages.dev，按 F12 打开控制台：
# crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-password'))
#   .then(buf => console.log(Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')))

# 然后在 KV 中设置密码和盐
wrangler kv:key put --binding=KV --namespace-id=<your-kv-id> "config:password" "<sha256-hash>"
wrangler kv:key put --binding=KV --namespace-id=<your-kv-id> "config:auth_salt" "initial-salt-value"
```

> **更简单的方式**：首次访问时，前端会提示"系统未初始化"。可以在配置页通过密码修改功能来设置密码（需要先手动写入 KV 初始值）。

---

## 本地开发

### 安装依赖

```bash
npm install -g wrangler
```

### 启动本地开发服务器

```bash
wrangler pages dev src/
```

默认在 `http://localhost:8788` 启动。

> **注意**：本地开发时 D1 和 KV 需要使用本地模拟，或者通过 `--d1` 和 `--kv` 参数绑定远程资源进行测试。

### 本地绑定远程资源测试

```bash
wrangler pages dev src/ --d1=DB/feeddeck-db --kv=CONFIG --remote
```

这会使用远程的 D1 和 KV 数据，适合在部署前进行端到端测试。

---

## API 文档

### 认证

所有 `/api/*` 端点（除 login 和 check）需要 `fd_session` cookie。

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
| POST | `/api/config/rss` | 添加 RSS 源 |
| DELETE | `/api/config/rss/:key` | 删除 RSS 源 |
| POST | `/api/config/ics` | 添加 ICS 订阅 |
| DELETE | `/api/config/ics/:id` | 删除 ICS 订阅 |
| PUT | `/api/config/password` | 修改密码 |

### 待办

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/todos` | 获取待办列表 |
| POST | `/api/todos` | 创建待办 |
| PUT | `/api/todos/:id` | 更新待办 |
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
| Cron Triggers | 3 个 | 4 个（需合并） |

> **提示**：免费套餐限制 3 个 Cron Trigger。当前项目有 4 个不同频率的任务，建议将 `*/5` 和 `*/15` 的任务合并到同一个 handler 中，按 task_name 区分执行逻辑。

---

## 安全说明

- 密码在客户端通过 SHA-256 哈希后发送，服务端二次哈希比对
- Session cookie 设置 `HttpOnly`、`Secure`、`SameSite=Strict`
- Session 有效期 30 天，过期自动清理
- 修改密码后所有现有 session 自动失效
- 所有 API 错误返回通用消息，不暴露内部细节

---

## License

MIT

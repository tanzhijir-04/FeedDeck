-- FeedDeck D1 数据库初始化
-- 8 张表 + 索引

-- 1. RSS 订阅条目
CREATE TABLE IF NOT EXISTS feed_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_key    TEXT NOT NULL,
  title       TEXT NOT NULL,
  link        TEXT,
  summary     TEXT,
  published_at TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feed_items_key ON feed_items(feed_key, published_at DESC);

-- 2. 热搜数据
CREATE TABLE IF NOT EXISTS hotsearch_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  platform    TEXT NOT NULL,
  rank        INTEGER,
  title       TEXT NOT NULL,
  url         TEXT,
  heat        TEXT,
  fetched_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hotsearch_platform ON hotsearch_items(platform, fetched_at DESC);

-- 3. 社交媒体粉丝数据
CREATE TABLE IF NOT EXISTS social_stats (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  platform        TEXT NOT NULL,
  account_id      TEXT NOT NULL,
  account_name    TEXT,
  follower_count  INTEGER,
  fetched_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_social_account ON social_stats(platform, account_id, fetched_at DESC);

-- 4. 天气缓存
CREATE TABLE IF NOT EXISTS weather_cache (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  city       TEXT NOT NULL,
  data       TEXT NOT NULL,
  fetched_at TEXT DEFAULT (datetime('now'))
);

-- 5. 日历事件
CREATE TABLE IF NOT EXISTS calendar_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT DEFAULT 'manual',
  uid         TEXT,
  title       TEXT NOT NULL,
  description TEXT,
  location    TEXT,
  start_time  TEXT NOT NULL,
  end_time    TEXT,
  all_day     INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_time);

-- 6. 待办事项
CREATE TABLE IF NOT EXISTS todo_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  completed    INTEGER DEFAULT 0,
  deadline     TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_todo_pending ON todo_items(completed, deadline);

-- 7. 会话存储
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- 8. 定时任务日志
CREATE TABLE IF NOT EXISTS fetch_log (
  task_name    TEXT PRIMARY KEY,
  last_run_at  TEXT,
  last_status  TEXT
);

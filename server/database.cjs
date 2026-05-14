/**
 * @file 数据库初始化与管理
 * @description 负责SQLite数据库的连接、表结构创建、默认数据填充以及数据库迁移。
 *              所有数据库操作均在此文件进行初始化。
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库文件路径
const dbPath = path.resolve(__dirname, 'visitors.db');

// 连接到SQLite数据库
// 如果文件不存在，sqlite3会自动创建一个新的数据库文件
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    // 数据库连接失败
    console.error('无法连接到数据库:', err.message);
  } else {
    // 数据库连接成功
    console.log('成功连接到SQLite数据库');
  }
});

// 序列化操作，确保数据库操作按顺序执行
db.serialize(() => {
  // 创建访客记录表
  db.run(`CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 访客ID，主键自增
    ip TEXT,                            -- 访客IP地址
    location TEXT,                      -- 访客地理位置
    device TEXT,                        -- 访客设备信息
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, -- 访问时间
    path TEXT                           -- 访问路径
  )`);

  // 创建友情链接表
  db.run(`CREATE TABLE IF NOT EXISTS friend_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 链接ID，主键自增
    name TEXT NOT NULL,                 -- 链接名称
    url TEXT NOT NULL,                  -- 链接URL
    weight INTEGER DEFAULT 0,           -- 链接权重，用于排序
    enabled INTEGER DEFAULT 1,          -- 是否启用 (1: 启用, 0: 禁用)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 更新时间
  )`);

  // 创建友情链接图标表
  db.run(`CREATE TABLE IF NOT EXISTS friend_link_icons (
    friend_link_id INTEGER PRIMARY KEY, -- 友情链接ID，主键
    icon_url TEXT NOT NULL,             -- 图标URL
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 更新时间
  )`);

  // 创建群聊表
  db.run(`CREATE TABLE IF NOT EXISTS group_chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 群聊ID，主键自增
    name TEXT NOT NULL,                 -- 群聊名称
    link TEXT,                          -- 群聊链接
    avatar_url TEXT,                    -- 群聊头像URL
    enabled INTEGER DEFAULT 1,          -- 是否启用 (1: 启用, 0: 禁用)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 更新时间
  )`);

  // 创建公告分类表
  db.run(`CREATE TABLE IF NOT EXISTS announcement_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 分类ID，主键自增
    name TEXT NOT NULL,                 -- 分类名称
    parent_id INTEGER,                  -- 父分类ID (如果存在)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 创建时间
  )`);

  // 创建公告表
  db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 公告ID，主键自增
    title TEXT NOT NULL,                -- 公告标题
    content_html TEXT,                  -- 公告HTML内容
    content_markdown TEXT,              -- 公告Markdown内容
    status TEXT CHECK(status IN ('draft','published','offline')) DEFAULT 'draft', -- 公告状态 (draft: 草稿, published: 已发布, offline: 已下线)
    category_id INTEGER,                -- 公告分类ID
    scheduled_at DATETIME,              -- 预定发布时间
    published_at DATETIME,              -- 实际发布时间
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 更新时间
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 创建时间
  )`);

  // 创建环境变量表
  db.run(`CREATE TABLE IF NOT EXISTS env_vars (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 变量ID，主键自增
    key TEXT NOT NULL UNIQUE,           -- 变量键名，唯一
    value_encrypted TEXT NOT NULL,      -- 加密后的变量值
    category TEXT,                      -- 变量分类
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 更新时间
  )`);

  // 创建环境变量历史表
  db.run(`CREATE TABLE IF NOT EXISTS env_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 历史ID，主键自增
    key TEXT NOT NULL,                  -- 变量键名
    old_value_encrypted TEXT,           -- 旧的加密变量值
    new_value_encrypted TEXT,           -- 新的加密变量值
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 更新时间
  )`);

  // 创建用户表
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 用户ID，主键自增
    username TEXT UNIQUE NOT NULL,      -- 用户名，唯一且非空
    password_hash TEXT NOT NULL,        -- 密码哈希值
    role TEXT DEFAULT 'admin',          -- 用户角色 (默认为admin)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 创建时间
  )`);

  // 创建操作日志表
  db.run(`CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 日志ID，主键自增
    actor TEXT,                         -- 操作人
    action TEXT,                        -- 操作动作
    entity TEXT,                        -- 操作实体
    entity_id INTEGER,                  -- 实体ID
    payload TEXT,                       -- 操作详情 (JSON字符串)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 操作时间
  )`);

  // 创建音乐API表
  db.run(`CREATE TABLE IF NOT EXISTS music_apis (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- API ID，主键自增
    name TEXT NOT NULL,                 -- API名称
    url TEXT NOT NULL,                  -- API URL
    type TEXT DEFAULT 'netease',        -- API类型 (e.g., netease)
    status TEXT DEFAULT 'unknown',      -- API状态 (e.g., unknown, healthy, unhealthy)
    latency INTEGER DEFAULT 0,          -- API延迟 (毫秒)
    enabled INTEGER DEFAULT 1,          -- 是否启用 (1: 启用, 0: 禁用)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 更新时间
  )`);

  // 创建事件/维护表
  db.run(`CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 事件ID，主键自增
    title TEXT NOT NULL,                -- 事件标题
    content TEXT,                       -- 事件内容
    status TEXT NOT NULL,               -- 事件状态 (investigating: 调查中, identified: 已识别, monitoring: 监控中, resolved: 已解决, scheduled: 已计划)
    type TEXT NOT NULL DEFAULT 'incident', -- 事件类型 (incident: 事件, maintenance: 维护)
    start_time INTEGER,                 -- 开始时间 (Unix时间戳)
    end_time INTEGER,                   -- 结束时间 (Unix时间戳)
    created_at INTEGER DEFAULT (strftime('%s', 'now')), -- 创建时间 (Unix时间戳)
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))  -- 更新时间 (Unix时间戳)
  )`);

  // 创建应用表
  db.run(`CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 应用ID，主键自增
    name TEXT NOT NULL,                 -- 应用名称
    provider TEXT,                      -- 应用提供商
    bg_url TEXT,                        -- 背景图片URL
    icon_url TEXT,                      -- 图标URL
    download_url TEXT,                  -- 下载链接
    enabled INTEGER DEFAULT 1,          -- 是否启用 (1: 启用, 0: 禁用)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 更新时间
  )`);

  // 创建更新日志表
  db.run(`CREATE TABLE IF NOT EXISTS changelogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 日志ID，主键自增
    version TEXT NOT NULL,              -- 版本号
    content_markdown TEXT,              -- Markdown格式的更新内容
    content_html TEXT,                  -- HTML格式的更新内容
    release_date DATETIME DEFAULT CURRENT_TIMESTAMP, -- 发布日期
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 更新时间
  )`);

  // 创建站点卡片配置表
  db.run(`CREATE TABLE IF NOT EXISTS site_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 卡片ID，主键自增
    key TEXT NOT NULL UNIQUE,           -- 卡片唯一键
    title TEXT,                         -- 卡片标题
    enabled INTEGER DEFAULT 1,          -- 是否启用 (1: 启用, 0: 禁用)
    sort_order INTEGER DEFAULT 0,       -- 排序顺序
    style TEXT,                         -- 卡片样式 (JSON字符串)
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 更新时间
  )`);

  // 站点卡片默认数据填充
  const defaultCards = [
    { key: 'friend_links', title: '友情链接', sort_order: 10, style: JSON.stringify({ span: 12, accent: 'bg-yellow' }) },
    { key: 'group_chats', title: '群聊', sort_order: 20, style: JSON.stringify({ span: 12, accent: 'bg-green' }) },
    { key: 'announcements', title: '公告', sort_order: 30, style: JSON.stringify({ span: 24, accent: 'bg-yellow' }) },
    { key: 'apps', title: '应用', sort_order: 40, style: JSON.stringify({ span: 24, accent: 'bg-yellow' }) },
    { key: 'music', title: '在线播放', sort_order: 5, style: JSON.stringify({ span: 24, accent: 'bg-red' }) }
  ];

  defaultCards.forEach(card => {
    db.run(`INSERT OR IGNORE INTO site_cards (key, title, sort_order, style) VALUES (?, ?, ?, ?)`, [card.key, card.title, card.sort_order, card.style]);
  });

  // 创建关于页面配置表
  db.run(`CREATE TABLE IF NOT EXISTS about_page (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- 唯一ID，固定为1
    content_html TEXT,                  -- 关于页面HTML内容
    content_markdown TEXT,              -- 关于页面Markdown内容
    author_name TEXT,                   -- 作者名称
    author_avatar TEXT,                 -- 作者头像URL
    author_github TEXT,                 -- 作者GitHub链接
    github_repo TEXT,                   -- GitHub仓库链接
    version TEXT,                       -- 项目版本
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 更新时间
  )`);

  // 关于页面默认数据填充
  db.get(`SELECT id FROM about_page WHERE id = 1`, [], (err, row) => {
    if (!row) {
      db.run(`INSERT INTO about_page (id, content_html, author_name, version) VALUES (1, '', 'ChuEng', '1.0.0')`);
    }
  });

  // 数据库迁移：确保旧数据库中存在新列
  function ensureColumn(table, column, type) {
    db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
      if (err || !rows) return; // 错误处理或无行返回
      const has = rows.some(r => r.name === column); // 检查列是否存在
      if (!has) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, (alterErr) => {
          if (alterErr) {
            console.error(`为表 ${table} 添加列 ${column} 失败:`, alterErr.message);
          } else {
            console.log(`已为表 ${table} 添加列 ${column}`);
          }
        });
      }
    });
  }
  // 调用ensureColumn函数进行列迁移
  ensureColumn('announcements', 'content_markdown', 'TEXT');
  ensureColumn('announcements', 'published_at', 'DATETIME');
  ensureColumn('announcements', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  ensureColumn('group_chats', 'enabled', 'INTEGER DEFAULT 1');
  ensureColumn('apps', 'icon_url', 'TEXT');
  ensureColumn('about_page', 'github_repo', 'TEXT');
  ensureColumn('about_page', 'author_avatar', 'TEXT');
  ensureColumn('about_page', 'author_github', 'TEXT');
  ensureColumn('about_page', 'content_markdown', 'TEXT');
  ensureColumn('visitors', 'path', 'TEXT');
});

// 导出数据库实例
module.exports = db;

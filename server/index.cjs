/**
 * @file 后端主入口文件
 * @description 负责设置Express服务器、定义API路由、处理数据请求、管理WebSocket连接以及集成各种后端服务。
 *              包括访客追踪、文件上传、UptimeRobot监控代理、音乐API代理、CRUD操作等功能。
 */
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { WebSocketServer } = require('ws');
const db = require('./database.cjs'); // 导入数据库连接
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // 加载环境变量

// 初始化Express应用
const app = express();
// 信任第一个代理，用于获取真实的客户端IP地址
app.set('trust proxy', true);
// 定义服务器端口，优先使用环境变量PORT，否则使用3001
const PORT = process.env.PORT || 3001;

// 配置CORS，允许跨域请求
app.use(cors());
// 解析JSON格式的请求体
app.use(express.json());

// 配置静态文件服务
// 上传文件目录
const uploadsDir = path.join(__dirname, 'uploads');
// 如果上传目录不存在，则创建
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
// 将 /uploads 路径映射到实际的上传文件目录
app.use('/uploads', express.static(uploadsDir));

// 提供前端静态资源
// 确保在 /uploads 路由之后提供静态文件，以免 /uploads 被单页应用（SPA）回退或静态中间件捕获
app.use(express.static(path.join(__dirname, '../dist')));

// Multer 文件上传配置
const storage = multer.diskStorage({
  // 设置文件存储目标目录
  destination: (req, file, cb) => cb(null, uploadsDir),
  // 设置文件名
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname); // 获取文件扩展名
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`; // 生成唯一文件名
    cb(null, name);
  }
});
const upload = multer({ storage }); // 初始化Multer上传中间件

// 环境变量加密辅助函数
const secretKeyPath = path.join(__dirname, 'secret.key'); // 密钥文件路径

/**
 * 获取或生成用于加密的密钥。
 * 优先使用环境变量 ENV_SECRET_KEY，如果不存在则尝试读取 secret.key 文件，
 * 如果文件也不存在则生成新的密钥并保存到 secret.key。
 * @returns {Buffer} 加密密钥
 */
function getSecretKey() {
  const envKey = process.env.ENV_SECRET_KEY;
  if (envKey) return Buffer.from(envKey, 'hex'); // 从环境变量获取密钥
  if (fs.existsSync(secretKeyPath)) {
    return fs.readFileSync(secretKeyPath); // 从文件读取密钥
  }
  const key = crypto.randomBytes(32); // 生成新的32字节随机密钥
  fs.writeFileSync(secretKeyPath, key); // 将新密钥写入文件
  return key;
}
const KEY = getSecretKey(); // 获取加密密钥

/**
 * 使用AES-256-GCM算法加密文本。
 * @param {string} text - 待加密的明文。
 * @returns {string} 加密后的Base64字符串。
 */
function encrypt(text) {
  const iv = crypto.randomBytes(12); // 生成12字节的初始化向量
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv); // 创建加密器
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]); // 加密数据
  const tag = cipher.getAuthTag(); // 获取认证标签
  return Buffer.concat([iv, tag, enc]).toString('base64'); // 组合IV、标签和密文并进行Base64编码
}

/**
 * 使用AES-256-GCM算法解密Base64字符串。
 * @param {string} data - 待解密的Base64字符串。
 * @returns {string} 解密后的明文，如果解密失败则返回空字符串。
 */
function decrypt(data) {
  try {
    const buf = Buffer.from(data, 'base64'); // 将Base64字符串转换为Buffer
    const iv = buf.slice(0, 12); // 提取初始化向量
    const tag = buf.slice(12, 28); // 提取认证标签
    const enc = buf.slice(28); // 提取密文
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv); // 创建解密器
    decipher.setAuthTag(tag); // 设置认证标签
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]); // 解密数据
    return dec.toString('utf8'); // 将解密后的Buffer转换为UTF-8字符串
  } catch (error) {
    console.error('解密失败:', error.message); // 记录解密失败错误
    return ''; // 解密失败返回空字符串
  }
}

/**
 * 规范化请求的IP地址。
 * @param {object} req - Express请求对象。
 * @returns {string} 规范化后的IP地址。
 */
function normalizeIp(req) {
  // 优先从 'x-forwarded-for' 头获取IP，否则从 'remoteAddress' 获取，默认为 '127.0.0.1'
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  // 将 IPv6 的 '::1' 转换为 IPv4 的 '127.0.0.1'，并处理多个IP的情况
  return ip === '::1' ? '127.0.0.1' : String(ip).split(',')[0].trim();
}

/**
 * 获取访客的元数据，包括IP、地理位置和设备信息。
 * @param {object} req - Express请求对象。
 * @returns {object} 包含 cleanIp, location, device 的访客元数据。
 */
function getVisitorMeta(req) {
  const cleanIp = normalizeIp(req); // 获取规范化IP
  const geo = geoip.lookup(cleanIp); // 查询IP的地理位置信息
  // 格式化地理位置信息
  const location = geo ? [geo.city, geo.country].filter(Boolean).join(' ') : '未知本地';

  const parser = new UAParser(req.headers['user-agent']); // 解析User-Agent
  const browser = parser.getBrowser(); // 获取浏览器信息
  const os = parser.getOS(); // 获取操作系统信息
  const dev = parser.getDevice(); // 获取设备信息

  // 格式化浏览器、设备和操作系统字符串
  const browserStr = [browser.name, browser.version].filter(Boolean).join(' ');
  const deviceStr = [dev.vendor, dev.model].filter(Boolean).join(' ');
  const osStr = [os.name, os.version].filter(Boolean).join(' ');
  const parts = [deviceStr, osStr, browserStr].filter(Boolean);

  return {
    cleanIp,
    location,
    device: parts.length > 0 ? parts.join(' - ') : '未知设备' // 组合设备信息
  };
}

/**
 * 规范化被追踪的路径。
 * @param {string} rawPath - 原始路径。
 * @returns {string} 规范化后的路径，确保以 '/' 开头。
 */
function normalizeTrackedPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return '/';
  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
}

/**
 * 记录访客信息到数据库。
 * @param {object} req - Express请求对象。
 * @param {string} trackedPath - 访客访问的路径。
 * @param {function} callback - 回调函数，处理记录结果。
 */
function recordVisitor(req, trackedPath, callback) {
  const { cleanIp, location, device } = getVisitorMeta(req); // 获取访客元数据
  const pathValue = normalizeTrackedPath(trackedPath); // 规范化路径

  db.run(
    `INSERT INTO visitors (ip, location, device, path) VALUES (?, ?, ?, ?)`,
    [cleanIp, location, device, pathValue],
    function(err) {
      if (err) {
        console.error('记录访客信息出错:', err);
        if (typeof callback === 'function') callback(err);
        return;
      }

      // 构建访客信息载荷
      const payload = {
        id: this.lastID,
        ip: cleanIp,
        location,
        device,
        path: pathValue,
        timestamp: new Date().toISOString()
      };
      broadcast('visitors:new', payload); // 通过WebSocket广播新访客信息
      if (typeof callback === 'function') callback(null, payload);
    }
  );
}

// 访客追踪API路由
app.get('/api/public/track', (req, res) => {
  const trackedPath = typeof req.query.path === 'string' ? req.query.path : '/'; // 获取追踪路径
  recordVisitor(req, trackedPath, (err) => {
    if (err) return res.status(500).json({ error: '记录访客失败' });
    res.json({ ok: true });
  });
});

// API 代理路由，用于调试和绕过CORS
app.post('/api/proxy-request', async (req, res) => {
  const { url, method = 'GET', headers = {}, data = null, body = null } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL是必需的' });
  }

  try {
    const config = {
      method,
      url,
      headers: {
        ...headers,
        // 移除Host头，避免与axios/node冲突，由其自动处理
        host: undefined
      },
      data: data || body, // 请求体数据
      timeout: 10000, // 10秒超时
      validateStatus: () => true // 接受所有状态码，不抛出错误
    };

    const startTime = Date.now(); // 记录请求开始时间
    const response = await axios(config); // 发送代理请求
    const duration = Date.now() - startTime; // 计算请求耗时

    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      duration
    });
  } catch (error) {
    console.error('代理请求失败:', error.message);
    res.json({
      status: 0,
      statusText: '错误',
      error: error.message,
      duration: 0
    });
  }
});

// 音乐代理端点，用于流式传输音频 (HTTP -> HTTPS)
app.get('/api/music-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).send('URL是必需的');
  }

  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream', // 以流的形式获取响应
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://music.163.com/' // 设置Referer头，模拟浏览器请求
      }
    });

    // 设置响应头
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res); // 将代理响应流式传输到客户端
  } catch (error) {
    console.error('音乐代理错误:', error.message);
    res.status(500).send('代理错误');
  }
});

// 文件上传端点
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  // 根据部署情况，可以使用绝对URL或相对URL
  // 在生产环境中，前端和后端通常在同一域/端口，相对URL即可。
  // 但如果使用代理，请确保 /uploads 可访问。
  // 为了安全起见，可以根据请求主机构建完整的URL，或者保持相对URL。
  // const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  // const host = req.headers['host'];
  // const url = `${protocol}://${host}/uploads/${req.file.filename}`;
  const url = `/uploads/${req.file.filename}`; // 构建文件可访问URL
  res.json({ url });
});

// UptimeRobot代理路由
app.get('/api/monitors', async (req, res) => {
  try {
    const API_KEY = process.env.VUE_APP_API_KEY; // 从环境变量获取API Key
    if (!API_KEY) {
      throw new Error('环境变量中未找到API Key');
    }

    // UptimeRobot API要求使用x-www-form-urlencoded格式
    const params = new URLSearchParams();
    params.append('api_key', API_KEY);
    params.append('format', 'json');
    params.append('logs', '1'); // 获取日志
    params.append('response_times', '1'); // 获取响应时间
    params.append('ssl', '1'); // 获取SSL信息
    params.append('custom_uptime_ratios', '1-7-30'); // 获取过去1天、7天、30天的可用率

    // 为可视化生成30天的自定义时间范围
    const now = Math.floor(Date.now() / 1000);
    const ranges = [];
    for (let i = 29; i >= 0; i--) {
      const start = now - (i + 1) * 86400; // 86400秒 = 1天
      const end = now - i * 86400;
      ranges.push(`${start}_${end}`);
    }
    params.append('custom_uptime_ranges', ranges.join('-'));

    const response = await axios.post('https://api.uptimerobot.com/v2/getMonitors', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('UptimeRobot API错误:', error.message);
    res.status(500).json({ error: '获取监控器失败' });
  }
});

// 获取访客统计数据
app.get('/api/visitors', (req, res) => {
  const limit = Number(req.query.limit || 50); // 每页限制数量
  const page = req.query.page ? Number(req.query.page) : null; // 当前页码
  const { location, device, path: visitorPath } = req.query; // 过滤条件

  let whereClauses = []; // WHERE子句数组
  let whereParams = []; // WHERE参数数组

  // 根据查询参数构建WHERE子句
  if (location) {
    whereClauses.push(`location LIKE ?`);
    whereParams.push(`%${location}%`);
  }
  if (device) {
    whereClauses.push(`device LIKE ?`);
    whereParams.push(`%${device}%`);
  }
  if (visitorPath) {
    whereClauses.push(`path LIKE ?`);
    whereParams.push(`%${visitorPath}%`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''; // 拼接WHERE子句

  // 查询访客总数、独立IP数、地点种类和设备种类
  db.get(
    `SELECT 
      COUNT(*) AS total,
      COUNT(DISTINCT ip) AS unique_ip,
      COUNT(DISTINCT location) AS location_kinds,
      COUNT(DISTINCT device) AS device_kinds
     FROM visitors ${whereSql}`,
    whereParams, 
    (e1, agg) => {
    if (e1) return res.status(500).json({ error: e1.message });
    
    let sql = `SELECT * FROM visitors ${whereSql} ORDER BY timestamp DESC LIMIT ?`;
    let params = [...whereParams, limit];

    // 如果指定了页码，则添加OFFSET
    if (page) {
      const offset = (page - 1) * limit;
      sql = `SELECT * FROM visitors ${whereSql} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      params = [...whereParams, limit, offset];
    }

    // 查询访客记录
    db.all(sql, params, (e2, rows) => {
      if (e2) {
        res.status(500).json({ error: e2.message });
        return;
      }
      // 聚合统计数据（总数、独立IP）现在使用过滤器。
      // 但下面的 location_stats 和 device_stats 是全局的，用于“分布”视图。
      
      // 获取访客地点分布统计
      db.all(`SELECT location AS name, COUNT(*) AS count FROM visitors GROUP BY location ORDER BY count DESC`, [], (e3, locRows) => {
        if (e3) {
          res.status(500).json({ error: e3.message });
          return;
        }
        // 获取访客设备分布统计
        db.all(`SELECT device AS name, COUNT(*) AS count FROM visitors GROUP BY device ORDER BY count DESC`, [], (e4, devRows) => {
          if (e4) {
            res.status(500).json({ error: e4.message });
            return;
          }
          // 返回所有统计数据
          res.json({
            visitors: rows,
            total: agg?.total ?? rows.length,
            unique_ip: agg?.unique_ip ?? 0,
            location_kinds: agg?.location_kinds ?? 0,
            device_kinds: agg?.device_kinds ?? 0,
            location_stats: locRows || [],
            device_stats: devRows || [],
          });
        });
      });
    });
  });
});

// 批量删除访客记录
app.post('/api/visitors/batch-delete', requireAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '未提供ID' });
  }

  const placeholders = ids.map(() => '?').join(','); // 生成SQL占位符
  const sql = `DELETE FROM visitors WHERE id IN (${placeholders})`; // 构建删除SQL

  db.run(sql, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes }); // 返回删除的行数
  });
});

// 格式化SQLite日期时间
function formatSqliteDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * 根据范围键获取时间范围的开始和结束日期。
 * @param {string} rangeKey - 时间范围键 (e.g., 'today', 'last_7', 'this_month')。
 * @returns {{start: string, end: string}} 包含开始和结束日期的对象。
 */
function getRangeStartAndEnd(rangeKey) {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  // 将日期设置为UTC当天的开始
  const startOfUtcDay = (d) => {
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };

  switch (rangeKey) {
    case 'today':
      startOfUtcDay(start);
      break;
    case 'this_week': {
      startOfUtcDay(start);
      const day = start.getUTCDay(); // 0 for Sunday, 1 for Monday, etc.
      const diff = day === 0 ? 6 : day - 1; // 计算到本周一的偏移量
      start.setUTCDate(start.getUTCDate() - diff);
      break;
    }
    case 'this_month':
      start.setUTCDate(1); // 设置为本月第一天
      startOfUtcDay(start);
      break;
    case 'last_24h':
      start.setTime(start.getTime() - 24 * 60 * 60 * 1000); // 过去24小时
      break;
    case 'last_7':
      startOfUtcDay(start);
      start.setUTCDate(start.getUTCDate() - 6); // 过去7天
      break;
    case 'last_30':
      startOfUtcDay(start);
      start.setUTCDate(start.getUTCDate() - 29); // 过去30天
      break;
    case 'last_90':
      startOfUtcDay(start);
      start.setUTCDate(start.getUTCDate() - 89); // 过去90天
      break;
    case 'last_180':
      startOfUtcDay(start);
      start.setUTCDate(start.getUTCDate() - 179); // 过去180天
      break;
    default: {
      const fallbackDays = Math.max(Number(rangeKey) || 30, 1); // 默认30天
      startOfUtcDay(start);
      start.setUTCDate(start.getUTCDate() - (fallbackDays - 1));
    }
  }

  return {
    start: formatSqliteDateTime(start),
    end: formatSqliteDateTime(end)
  };
}

// 获取访客趋势数据
app.get('/api/visitors/trend', requireAuth, (req, res) => {
  const range = typeof req.query.range === 'string' ? req.query.range : null; // 时间范围键
  const days = Number(req.query.days || 30); // 默认天数
  const { start, end } = range ? getRangeStartAndEnd(range) : getRangeStartAndEnd(String(days)); // 获取开始和结束日期

  const sql = `
    SELECT 
      strftime('%Y-%m-%d', timestamp) as date, -- 按日期分组
      COUNT(*) as count,                     -- 每日访问量
      COUNT(DISTINCT ip) as unique_ip        -- 每日独立访客数
    FROM visitors
    WHERE timestamp BETWEEN ? AND ?          -- 筛选指定时间范围
    GROUP BY date
    ORDER BY date ASC
  `;
  
  db.all(sql, [start, end], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 获取访客摘要统计
app.get('/api/visitors/summary', requireAuth, (req, res) => {
  const range = typeof req.query.range === 'string' ? req.query.range : 'last_30'; // 默认过去30天
  const { start, end } = getRangeStartAndEnd(range); // 获取开始和结束日期

  db.get(
    `
      SELECT
        COUNT(*) AS visits,       -- 总访问量
        COUNT(DISTINCT ip) AS unique_ip -- 总独立访客数
      FROM visitors
      WHERE timestamp BETWEEN ? AND ?
    `,
    [start, end],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        visits: row?.visits ?? 0,
        unique_ip: row?.unique_ip ?? 0,
        range,
        start,
        end,
      });
    }
  );
});

// 导出访客日志为CSV
app.get('/api/visitors/export', requireAuth, (req, res) => {
  db.all(`SELECT * FROM visitors ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).send('数据库错误');
    
    // 转换为CSV格式
    const header = ['ID', 'IP', 'Location', 'Device', 'Path', 'Time'];
    const csvRows = rows.map(r => {
      // 转义双引号和处理逗号
      const esc = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
      return [r.id, r.ip, r.location, r.device, r.path, r.timestamp].map(esc).join(',');
    });
    
    const csvContent = '\uFEFF' + [header.join(','), ...csvRows].join('\n'); // 添加BOM头，兼容Excel中文显示
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="visitors-${Date.now()}.csv"`);
    res.send(csvContent);
  });
});

// 友情链接 CRUD 操作 (带分页和批量操作)
app.get('/api/friend-links', requireAuth, (req, res) => {
  const page = Number(req.query.page || 1); // 当前页码
  const pageSize = Number(req.query.pageSize || 10); // 每页数量
  const offset = (page - 1) * pageSize; // 计算偏移量
  db.all(
    `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC LIMIT ? OFFSET ?`,
    [pageSize, offset],
    (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // 获取总数
    db.get(`SELECT COUNT(*) AS total FROM friend_links`, [], (e2, count) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ items: rows, total: count.total, page, pageSize });
    });
  });
});

// 创建友情链接
app.post('/api/friend-links', requireAuth, (req, res) => {
  const { name, url, weight = 0, enabled = 1, icon_url } = req.body;
  db.run(`INSERT INTO friend_links (name, url, weight, enabled) VALUES (?,?,?,?)`, [name, url, weight, enabled], function(err){
    if (err) return res.status(500).json({ error: err.message });
    const linkId = this.lastID; // 获取新插入的ID
    const normalizedIconUrl = typeof icon_url === 'string' ? icon_url.trim() : ''; // 规范化图标URL
    const afterIcon = () => {
      // 记录操作日志
      logAction(req.user?.username, 'create', 'friend_links', linkId, { name, url, weight, enabled, icon_url: normalizedIconUrl || null });
      // 广播更新
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ id: linkId });
    };

    // 如果提供了图标URL，则插入或更新图标
    if (normalizedIconUrl) {
      db.run(
        `INSERT INTO friend_link_icons (friend_link_id, icon_url) VALUES (?, ?) ON CONFLICT(friend_link_id) DO UPDATE SET icon_url=excluded.icon_url, updated_at=CURRENT_TIMESTAMP`,
        [linkId, normalizedIconUrl],
        () => afterIcon()
      );
    } else {
      afterIcon();
    }
  });
});

// 更新友情链接
app.put('/api/friend-links/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, url, weight, enabled, icon_url } = req.body;
  db.run(`UPDATE friend_links SET name=?, url=?, weight=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [name, url, weight, enabled, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    const normalizedIconUrl = typeof icon_url === 'string' ? icon_url.trim() : '';
    const afterIcon = () => {
      logAction(req.user?.username, 'update', 'friend_links', id, { name, url, weight, enabled, icon_url: normalizedIconUrl || null });
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ changed: this.changes });
    };

    // 如果提供了图标URL，则插入或更新图标；否则删除图标
    if (normalizedIconUrl) {
      db.run(
        `INSERT INTO friend_link_icons (friend_link_id, icon_url) VALUES (?, ?) ON CONFLICT(friend_link_id) DO UPDATE SET icon_url=excluded.icon_url, updated_at=CURRENT_TIMESTAMP`,
        [id, normalizedIconUrl],
        () => afterIcon()
      );
    } else {
      db.run(`DELETE FROM friend_link_icons WHERE friend_link_id=?`, [id], () => afterIcon());
    }
  });
});

// 删除友情链接
app.delete('/api/friend-links/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  // 先删除图标，再删除链接
  db.run(`DELETE FROM friend_link_icons WHERE friend_link_id=?`, [id], () => {
    db.run(`DELETE FROM friend_links WHERE id=?`, [id], function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'delete', 'friend_links', id);
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ deleted: this.changes });
    });
  });
});

// 批量操作友情链接 (删除、启用、禁用)
app.post('/api/friend-links/batch', requireAuth, (req, res) => {
  const { ids = [], action } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ changed: 0 });
  const placeholders = ids.map(()=>'?').join(','); // 生成SQL占位符

  if (action === 'delete') {
    // 批量删除链接
    db.run(`DELETE FROM friend_links WHERE id IN (${placeholders})`, ids, function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'batch_delete', 'friend_links', null, { ids });
      // 同时删除图标
      db.run(`DELETE FROM friend_link_icons WHERE friend_link_id IN (${placeholders})`, ids, () => {
        db.all(
          `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
          [],
          (e2, rows) => {
            if (!e2) broadcast('links:update', rows);
          }
        );
        res.json({ changed: this.changes });
      });
    });
  } else if (action === 'enable' || action === 'disable') {
    // 批量启用或禁用链接
    const enabled = action === 'enable' ? 1 : 0;
    db.run(`UPDATE friend_links SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [enabled, ...ids], function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'batch_enable', 'friend_links', null, { ids, enabled });
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ changed: this.changes });
    });
  } else {
    res.status(400).json({ error: '未知操作' });
  }
});

// 获取公共友情链接 (供首页显示)
app.get('/api/public/friend-links', (req, res) => {
  db.all(`SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id WHERE fl.enabled=1 ORDER BY fl.weight DESC, fl.id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 群聊 CRUD 操作
app.get('/api/group-chats', requireAuth, (req, res) => {
  db.all(`SELECT * FROM group_chats ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 创建群聊
app.post('/api/group-chats', requireAuth, (req, res) => {
  const { name, link, avatar_url, enabled = 1 } = req.body;
  db.run(`INSERT INTO group_chats (name, link, avatar_url, enabled) VALUES (?,?,?,?)`, [name, link || null, avatar_url || null, Number(enabled) ? 1 : 0], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'create', 'group_chats', this.lastID, { name, link, avatar_url, enabled: Number(enabled) ? 1 : 0 });
    db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('groups:update', rows);
    });
    res.json({ id: this.lastID });
  });
});

// 更新群聊
app.put('/api/group-chats/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, link, avatar_url, enabled } = req.body || {};

  const sets = []; // 更新字段数组
  const params = []; // 更新参数数组
  if (typeof name !== 'undefined') { sets.push('name=?'); params.push(name); }
  if (typeof link !== 'undefined') { sets.push('link=?'); params.push(link || null); }
  if (typeof avatar_url !== 'undefined') { sets.push('avatar_url=?'); params.push(avatar_url || null); }
  if (typeof enabled !== 'undefined') { sets.push('enabled=?'); params.push(Number(enabled) ? 1 : 0); }

  if (sets.length === 0) return res.status(400).json({ error: '没有要更新的字段' });
  sets.push('updated_at=CURRENT_TIMESTAMP'); // 添加更新时间戳

  db.run(`UPDATE group_chats SET ${sets.join(', ')} WHERE id=?`, [...params, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'group_chats', id, { name, link, avatar_url, enabled });
    db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('groups:update', rows);
    });
    res.json({ changed: this.changes });
  });
});

// 删除群聊
app.delete('/api/group-chats/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM group_chats WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'group_chats', id);
    db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('groups:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

// 获取公共群聊 (供首页显示)
app.get('/api/public/group-chats', (req, res) => {
  db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 事件/维护 CRUD 操作
app.get('/api/incidents', requireAuth, (req, res) => {
  db.all(`SELECT * FROM incidents ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 创建事件/维护
app.post('/api/incidents', requireAuth, (req, res) => {
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `INSERT INTO incidents (title, content, status, type, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)`,
    [title, content, status, type || 'incident', start_time || null, end_time || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      logAction(req.user?.username, 'create', 'incidents', id, { title });
      // 广播更新，只包含未解决的事件或未结束的维护
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ id });
    }
  );
});

// 更新事件/维护
app.put('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `UPDATE incidents SET title=?, content=?, status=?, type=?, start_time=?, end_time=?, updated_at=strftime('%s', 'now') WHERE id=?`,
    [title, content, status, type, start_time || null, end_time || null, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'incidents', id, { title, status });
      // 广播更新，只包含未解决的事件或未结束的维护
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ changed: this.changes });
    }
  );
});

// 删除事件/维护
app.delete('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM incidents WHERE id=?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'incidents', id);
    // 广播更新，只包含未解决的事件或未结束的维护
    db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
      if (!e2) broadcast('incidents:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

// 获取公共活跃事件/维护 (供首页显示)
app.get('/api/public/incidents/active', (req, res) => {
  const now = Math.floor(Date.now() / 1000); // 当前Unix时间戳
  db.all(
    `SELECT * FROM incidents 
     WHERE status != 'resolved' 
     OR (type = 'maintenance' AND end_time > ?) 
     ORDER BY type DESC, start_time DESC, created_at DESC`, 
    [now], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

// 应用 CRUD 操作
app.get('/api/apps', requireAuth, (req, res) => {
  db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 创建应用
app.post('/api/apps', requireAuth, (req, res) => {
  const { name, provider, bg_url, icon_url, download_url, enabled = 1 } = req.body;
  db.run(
    `INSERT INTO apps (name, provider, bg_url, icon_url, download_url, enabled) VALUES (?,?,?,?,?,?)`,
    [name, provider || null, bg_url || null, icon_url || null, download_url || null, Number(enabled) ? 1 : 0],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'create', 'apps', this.lastID, { name });
      db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
        if (!e2) broadcast('apps:update', rows);
      });
      res.json({ id: this.lastID });
    }
  );
});

// 更新应用
app.put('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, provider, bg_url, icon_url, download_url, enabled } = req.body || {};

  const sets = []; // 更新字段数组
  const params = []; // 更新参数数组
  if (typeof name !== 'undefined') { sets.push('name=?'); params.push(name); }
  if (typeof provider !== 'undefined') { sets.push('provider=?'); params.push(provider || null); }
  if (typeof bg_url !== 'undefined') { sets.push('bg_url=?'); params.push(bg_url || null); }
  if (typeof icon_url !== 'undefined') { sets.push('icon_url=?'); params.push(icon_url || null); }
  if (typeof download_url !== 'undefined') { sets.push('download_url=?'); params.push(download_url || null); }
  if (typeof enabled !== 'undefined') { sets.push('enabled=?'); params.push(Number(enabled) ? 1 : 0); }

  if (sets.length === 0) return res.status(400).json({ error: '没有要更新的字段' });
  sets.push('updated_at=CURRENT_TIMESTAMP'); // 添加更新时间戳

  db.run(`UPDATE apps SET ${sets.join(', ')} WHERE id=?`, [...params, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'apps', id, { name, provider, bg_url, icon_url, download_url, enabled });
    db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('apps:update', rows);
    });
    res.json({ changed: this.changes });
  });
});

// 删除应用
app.delete('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM apps WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'apps', id);
    db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('apps:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

// 获取公共应用 (供首页显示)
app.get('/api/public/apps', (req, res) => {
  db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 获取公共公告 (供首页显示)
app.get('/api/public/announcements', (req, res) => {
  const limit = Number(req.query.limit || 20); // 增加限制以确保获取到不同类别的公告
  db.all(
    `SELECT a.id, a.title, a.content_html, a.published_at, a.updated_at, a.category_id, c.name as category_name 
     FROM announcements a 
     LEFT JOIN announcement_categories c ON a.category_id = c.id 
     WHERE a.status='published' 
     ORDER BY a.published_at DESC, a.updated_at DESC 
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

// 公告分类 CRUD 操作
app.get('/api/announcement-categories', requireAuth, (req, res) => {
  db.all(`SELECT * FROM announcement_categories ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 创建公告分类
app.post('/api/announcement-categories', requireAuth, (req, res) => {
  const { name, parent_id } = req.body;
  db.run(`INSERT INTO announcement_categories (name, parent_id) VALUES (?,?)`, [name, parent_id || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// 更新公告分类
app.put('/api/announcement-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, parent_id } = req.body;
  db.run(`UPDATE announcement_categories SET name=?, parent_id=? WHERE id=?`, [name, parent_id || null, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changed: this.changes });
  });
});

// 删除公告分类
app.delete('/api/announcement-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM announcement_categories WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// 公告 CRUD 操作 (带分页)
app.get('/api/announcements', requireAuth, (req, res) => {
  const { status, page = 1, pageSize = 10 } = req.query;
  const p = Number(page), ps = Number(pageSize);
  const offset = (p - 1) * ps;
  const where = status ? `WHERE status=?` : ''; // 根据状态筛选
  const params = status ? [status, ps, offset] : [ps, offset];
  db.all(`SELECT * FROM announcements ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const countParams = status ? [status] : [];
    // 获取总数
    db.get(`SELECT COUNT(*) AS total FROM announcements ${where}`, countParams, (e2, c) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ items: rows, total: c.total, page: p, pageSize: ps });
    });
  });
});

// 创建公告
app.post('/api/announcements', requireAuth, (req, res) => {
  const { title, content_html, content_markdown, status = 'draft', category_id, scheduled_at } = req.body;
  db.run(`INSERT INTO announcements (title, content_html, content_markdown, status, category_id, scheduled_at) VALUES (?,?,?,?,?,?)`, [title, content_html, content_markdown || null, status, category_id || null, scheduled_at || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'create', 'announcements', this.lastID, { title });
    res.json({ id: this.lastID });
  });
});

// 更新公告
app.put('/api/announcements/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content_html, content_markdown, status, category_id, scheduled_at } = req.body;
  db.run(`UPDATE announcements SET title=?, content_html=?, content_markdown=?, status=?, category_id=?, scheduled_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [title, content_html, content_markdown || null, status, category_id || null, scheduled_at || null, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'announcements', id, { title });
    res.json({ changed: this.changes });
    // 广播更新已发布的公告
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});

// 删除公告
app.delete('/api/announcements/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM announcements WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'announcements', id);
    res.json({ deleted: this.changes });
    // 广播更新已发布的公告
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});

// 发布公告
app.post('/api/announcements/:id/publish', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE announcements SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'publish', 'announcements', id);
    res.json({ changed: this.changes });
    // 广播更新已发布的公告
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});

// 下线公告
app.post('/api/announcements/:id/offline', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE announcements SET status='offline', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'offline', 'announcements', id);
    res.json({ changed: this.changes });
    // 广播更新已发布的公告
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});

// 更新日志公共接口
app.get('/api/public/changelogs', (req, res) => {
  db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 更新日志 CRUD 操作
app.get('/api/changelogs', requireAuth, (req, res) => {
  db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 创建更新日志
app.post('/api/changelogs', requireAuth, (req, res) => {
  const { version, content_html, content_markdown, release_date } = req.body;
  db.run(
    `INSERT INTO changelogs (version, content_html, content_markdown, release_date) VALUES (?,?,?,?)`,
    [version, content_html, content_markdown, release_date || new Date().toISOString()],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'create', 'changelogs', this.lastID, { version });
      // 广播更新日志
      db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
        if (!e2) broadcast('changelogs:update', rows);
      });
      res.json({ id: this.lastID });
    }
  );
});

// 更新更新日志
app.put('/api/changelogs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { version, content_html, content_markdown, release_date } = req.body;
  db.run(
    `UPDATE changelogs SET version=?, content_html=?, content_markdown=?, release_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [version, content_html, content_markdown, release_date, id],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'changelogs', id, { version });
      // 广播更新日志
      db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
        if (!e2) broadcast('changelogs:update', rows);
      });
      res.json({ changed: this.changes });
    }
  );
});

// 删除更新日志
app.delete('/api/changelogs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM changelogs WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'changelogs', id);
    // 广播更新日志
    db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('changelogs:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

// Apps CRUD
app.get('/api/apps', requireAuth, (req, res) => {
  db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});
app.post('/api/apps', requireAuth, (req, res) => {
  const { name, provider, bg_url, download_url, enabled = 1 } = req.body;
  db.run(`INSERT INTO apps (name, provider, bg_url, download_url, enabled) VALUES (?,?,?,?,?)`, [name, provider || '', bg_url || '', download_url || '', enabled], function(err){
    if (err) return res.status(500).json({ error: err.message });
    const id = this.lastID;
    logAction(req.user?.username, 'create', 'apps', id, { name, provider, bg_url, download_url, enabled });
    db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => { if (!e2) broadcast('apps:update', rows); });
    res.json({ id });
  });
});
app.put('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, provider, bg_url, download_url, enabled = 1 } = req.body;
  db.run(`UPDATE apps SET name=?, provider=?, bg_url=?, download_url=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [name, provider || '', bg_url || '', download_url || '', enabled, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'apps', id, { name, provider, bg_url, download_url, enabled });
    db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => { if (!e2) broadcast('apps:update', rows); });
    res.json({ changed: this.changes });
  });
});
app.delete('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM apps WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'apps', id);
    db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => { if (!e2) broadcast('apps:update', rows); });
    res.json({ deleted: this.changes });
  });
});
// Public apps
app.get('/api/public/apps', (req, res) => {
  db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 站点卡片 CRUD 操作
app.get('/api/site-cards', requireAuth, (req, res) => {
  db.all(`SELECT * FROM site_cards ORDER BY sort_order ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 更新站点卡片
app.put('/api/site-cards/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const fields = []; // 待更新字段
  const values = []; // 待更新值

  // 根据请求体中的字段构建更新语句
  if (req.body.title !== undefined) {
    fields.push('title=?');
    values.push(req.body.title);
  }
  if (req.body.enabled !== undefined) {
    fields.push('enabled=?');
    values.push(req.body.enabled);
  }
  if (req.body.sort_order !== undefined) {
    fields.push('sort_order=?');
    values.push(req.body.sort_order);
  }
  if (req.body.style !== undefined) {
    fields.push('style=?');
    values.push(typeof req.body.style === 'object' ? JSON.stringify(req.body.style) : req.body.style);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: '没有要更新的字段' });
  }

  fields.push('updated_at=CURRENT_TIMESTAMP'); // 添加更新时间戳
  values.push(id); // 添加ID作为WHERE条件参数

  db.run(
    `UPDATE site_cards SET ${fields.join(', ')} WHERE id=?`,
    values,
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'site_cards', id, req.body);
      res.json({ changed: this.changes });
      // 广播更新站点卡片
      db.all(`SELECT * FROM site_cards ORDER BY sort_order ASC`, [], (e2, rows) => {
        if (!e2) broadcast('site_cards:update', rows);
      });
    }
  );
});

// 获取公共站点卡片 (供首页显示)
app.get('/api/public/site-cards', (req, res) => {
  db.all(`SELECT * FROM site_cards WHERE enabled=1 ORDER BY sort_order ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 关于页面 CRUD 操作
app.get('/api/about', requireAuth, (req, res) => {
  db.get(`SELECT * FROM about_page WHERE id = 1`, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || {});
  });
});

// 更新关于页面
app.put('/api/about', requireAuth, (req, res) => {
  const { content_html, content_markdown, author_name, author_avatar, author_github, github_repo, version } = req.body;
  db.run(
    `UPDATE about_page SET content_html=?, content_markdown=?, author_name=?, author_avatar=?, author_github=?, github_repo=?, version=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
    [content_html, content_markdown, author_name, author_avatar, author_github, github_repo, version],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'about_page', 1);
      res.json({ changed: this.changes });
    }
  );
});

// 获取公共关于页面
app.get('/api/public/about-page', (req, res) => {
  db.get(`SELECT * FROM about_page WHERE id=1`, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || {});
  });
});

// 环境变量管理
const envFilePath = path.join(__dirname, '../.env'); // .env文件路径

/**
 * 读取 .env 文件内容并解析为对象。
 * @returns {object} 包含环境变量键值对的对象。
 */
function readEnvFile() {
  if (!fs.existsSync(envFilePath)) return {}; // 如果文件不存在，返回空对象
  const content = fs.readFileSync(envFilePath, 'utf8'); // 读取文件内容
  const lines = content.split(/\r?\n/); // 按行分割
  const obj = {};
  lines.forEach(line => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/); // 匹配键值对
    if (m) obj[m[1]] = m[2]; // 存储到对象中
  });
  return obj;
}

/**
 * 向 .env 文件写入或更新单个环境变量。
 * @param {string} key - 环境变量的键。
 * @param {string} value - 环境变量的值。
 */
function writeEnvKey(key, value) {
  const content = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : ''; // 读取现有内容
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0); // 过滤空行
  let found = false;
  const newLines = lines.map(line => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === key) {
      found = true;
      return `${key}=${value}`; // 更新现有行
    }
    return line;
  });
  if (!found) newLines.push(`${key}=${value}`); // 如果未找到，则添加新行
  fs.writeFileSync(envFilePath, newLines.join('\n')); // 写回文件
}

/**
 * 根据环境变量的键名进行分类。
 * @param {string} key - 环境变量的键名。
 * @returns {string} 环境变量的类别。
 */
function categorizeKey(key) {
  if (/^(DB_|DATABASE_)/.test(key)) return 'database'; // 数据库相关
  if (/^(REDIS_|CACHE_)/.test(key)) return 'cache'; // 缓存相关
  if (/^(VUE_APP_|API_|THIRD_|SERVICE_)/.test(key)) return 'api'; // API或服务相关
  return 'other'; // 其他类别
}

// 获取环境变量配置
app.get('/api/env', requireAuth, (req, res) => {
  const envFile = readEnvFile(); // 读取 .env 文件中的变量
  db.all(`SELECT key, value_encrypted, category, updated_at FROM env_vars`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const result = {};
    // 合并 .env 文件中的值和数据库中的值 (数据库中的值被认为是安全的; 发送时进行掩码处理)
    Object.keys(envFile).forEach(k => {
      const cat = categorizeKey(k);
      if (!result[cat]) result[cat] = [];
      result[cat].push({ key: k, value: envFile[k], secure: false, updated_at: null });
    });
    rows.forEach(r => {
      const cat = r.category || categorizeKey(r.key);
      if (!result[cat]) result[cat] = [];
      result[cat].push({ key: r.key, value: '••••••', secure: true, updated_at: r.updated_at }); // 安全变量值进行掩码
    });
    res.json(result);
  });
});

// 更新环境变量配置
app.put('/api/env', requireAuth, (req, res) => {
  const { key, value, category, secure = true } = req.body;
  if (!key) return res.status(400).json({ error: 'key是必需的' });
  if (secure) {
    // 如果是安全变量，则加密存储到数据库
    const enc = encrypt(String(value || ''));
    db.get(`SELECT value_encrypted FROM env_vars WHERE key=?`, [key], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const oldEnc = row ? row.value_encrypted : null; // 获取旧的加密值
      const cat = category || categorizeKey(key);
      const upsert = row
        ? `UPDATE env_vars SET value_encrypted=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE key=?` // 更新现有记录
        : `INSERT INTO env_vars (value_encrypted, category, key) VALUES (?,?,?)`; // 插入新记录
      const params = row ? [enc, cat, key] : [enc, cat, key];
  db.run(upsert, params, function(e2){
    if (e2) return res.status(500).json({ error: e2.message });
    // 记录环境变量历史
    db.run(`INSERT INTO env_history (key, old_value_encrypted, new_value_encrypted) VALUES (?,?,?)`, [key, oldEnc, enc]);
    // 同时将明文写入 .env 文件以供运行时使用
    writeEnvKey(key, String(value || ''));
    logAction(req.user?.username, 'env_set', 'env_vars', null, { key });
    res.json({ ok: true });
  });
    });
  } else {
    // 如果不是安全变量，则只写入 .env 文件
    writeEnvKey(key, String(value || ''));
    logAction(req.user?.username, 'env_set_plain', 'env_vars', null, { key });
    res.json({ ok: true });
  }
});

// 获取环境变量历史记录
app.get('/api/env/history', requireAuth, (req, res) => {
  const key = req.query.key;
  const params = key ? [key] : [];
  const where = key ? 'WHERE key=?' : '';
  db.all(`SELECT * FROM env_history ${where} ORDER BY updated_at DESC LIMIT 100`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 环境变量回滚
app.post('/api/env/rollback', requireAuth, (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id是必需的' });
  db.get(`SELECT key, old_value_encrypted FROM env_history WHERE id=?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '未找到历史记录' });
    const plain = row.old_value_encrypted ? decrypt(row.old_value_encrypted) : ''; // 解密旧值
    const cat = categorizeKey(row.key);
    const enc = row.old_value_encrypted;
    db.run(`UPDATE env_vars SET value_encrypted=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE key=?`, [enc, cat, row.key], function(e2){
      if (e2) return res.status(500).json({ error: e2.message });
      writeEnvKey(row.key, plain); // 将旧值写回 .env 文件
      logAction(req.user?.username, 'env_rollback', 'env_vars', null, { id });
      res.json({ ok: true });
    });
  });
});

// 系统日志
app.get('/api/logs', requireAuth, (req, res) => {
  const page = Number(req.query.page || 1); // 当前页码
  const pageSize = Number(req.query.pageSize || 20); // 每页数量
  const offset = (page - 1) * pageSize; // 计算偏移量
  
  db.all(`SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`, [pageSize, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // 获取总数
    db.get(`SELECT COUNT(*) as total FROM operation_logs`, [], (e2, c) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ items: rows, total: c.total, page, pageSize });
    });
  });
});

// 批量删除系统日志
app.post('/api/logs/batch-delete', requireAuth, (req, res) => {
  const { ids, clearAll } = req.body;
  
  if (clearAll) {
    // 清空所有日志
    db.run(`DELETE FROM operation_logs`, [], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'clear_logs', 'operation_logs', null);
      res.json({ deleted: this.changes });
    });
    return;
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '未提供ID' });
  }

  const placeholders = ids.map(() => '?').join(','); // 生成SQL占位符
  db.run(`DELETE FROM operation_logs WHERE id IN (${placeholders})`, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete_logs', 'operation_logs', null, { count: this.changes });
    res.json({ deleted: this.changes });
  });
});

// Incidents CRUD
app.get('/api/public/incidents/active', (req, res) => {
  db.all(
    `SELECT * FROM incidents 
     WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) 
     ORDER BY type DESC, start_time DESC, created_at DESC`, 
    [Math.floor(Date.now() / 1000)], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

app.get('/api/incidents', requireAuth, (req, res) => {
  db.all(`SELECT * FROM incidents ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.post('/api/incidents', requireAuth, (req, res) => {
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `INSERT INTO incidents (title, content, status, type, start_time, end_time) VALUES (?,?,?,?,?,?)`,
    [title, content, status, type || 'incident', start_time || null, end_time || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'create', 'incidents', this.lastID, { title });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `UPDATE incidents SET title=?, content=?, status=?, type=?, start_time=?, end_time=?, updated_at=strftime('%s', 'now') WHERE id=?`,
    [title, content, status, type, start_time || null, end_time || null, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'incidents', id, { title });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ changed: this.changes });
    }
  );
});

app.delete('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM incidents WHERE id=?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'incidents', id);
    db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
      if (!e2) broadcast('incidents:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

// 计划发布任务：每分钟检查一次是否有需要发布的公告
setInterval(() => {
  const now = Date.now(); // 当前时间戳
  db.all(`SELECT id, scheduled_at, status FROM announcements WHERE status='draft' AND scheduled_at IS NOT NULL`, [], (err, rows) => {
    if (err || !rows) return; // 错误处理或无行返回
    rows.forEach(r => {
      const t = new Date(r.scheduled_at).getTime(); // 获取计划发布时间的时间戳
      if (t && t <= now) {
        // 如果计划发布时间已到，则将公告状态更新为“已发布”
        db.run(`UPDATE announcements SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [r.id]);
      }
    });
  });
}, 60000); // 每60秒（1分钟）执行一次

// WebSocket 服务器设置
const wss = new WebSocketServer({ noServer: true }); // 创建WebSocket服务器，不绑定HTTP服务器
const clients = new Set(); // 存储所有连接的客户端
wss.on('connection', (ws) => {
  clients.add(ws); // 将新连接添加到客户端集合
  ws.on('close', () => clients.delete(ws)); // 连接关闭时从集合中移除
});

/**
 * 向所有连接的WebSocket客户端广播消息。
 * @param {string} type - 消息类型。
 * @param {object} payload - 消息内容。
 */
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, ts: Date.now() }); // 序列化消息
  clients.forEach((ws) => {
    try { ws.send(msg); } catch (e) { /* 忽略发送错误 */ }
  });
}

// 升级HTTP连接到WebSocket
const server = require('http').createServer(app); // 创建HTTP服务器
server.on('upgrade', (request, socket, head) => {
  const { url } = request;
  if (url === '/ws') {
    // 如果是WebSocket连接请求，则处理升级
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy(); // 非WebSocket请求则销毁socket
  }
});

// 启动HTTP服务器
server.listen(PORT, () => {
  console.log(`后端服务器运行在 http://localhost:${PORT}`);
});

// 认证辅助函数
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'; // JWT密钥，优先使用环境变量，否则使用默认值

/**
 * Express中间件，用于验证JWT令牌。
 * @param {object} req - Express请求对象。
 * @param {object} res - Express响应对象。
 * @param {function} next - 下一个中间件函数。
 */
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || ''; // 获取Authorization头
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null; // 提取Bearer Token
  if (!token) return res.status(401).json({ error: '未授权' }); // 如果没有Token，返回未授权
  try {
    const data = jwt.verify(token, JWT_SECRET); // 验证Token
    req.user = data; // 将解码后的用户信息附加到请求对象
    next(); // 继续处理请求
  } catch (e) {
    return res.status(401).json({ error: '未授权' }); // Token验证失败，返回未授权
  }
}

/**
 * 记录操作日志到数据库并广播。
 * @param {string} actor - 操作执行者。
 * @param {string} action - 操作动作。
 * @param {string} entity - 操作实体。
 * @param {number|null} entity_id - 实体ID。
 * @param {object} payload - 操作详情载荷。
 */
function logAction(actor, action, entity, entity_id, payload) {
  const pStr = JSON.stringify(payload || {}); // 将载荷转换为JSON字符串
  db.run(
    `INSERT INTO operation_logs (actor, action, entity, entity_id, payload) VALUES (?,?,?,?,?)`,
    [actor || 'unknown', action, entity, entity_id || null, pStr],
    function(err) {
      if (!err) {
        // 构建要广播的日志对象
        // 注意：created_at 由数据库默认的 CURRENT_TIMESTAMP 生成，这里近似处理或查询。
        // 对于UI刷新，近似通常足够，或者我们可以触发重新加载信号。
        // 发送对象允许立即更新UI，如果需要的话。
        const newLog = {
          id: this.lastID,
          actor: actor || 'unknown',
          action,
          entity,
          entity_id: entity_id || null,
          payload: pStr,
          created_at: new Date().toISOString()
        };
        broadcast('logs:new', newLog); // 广播新日志
      }
    }
  );
}

// 初始化管理员用户
db.get(`SELECT id FROM users WHERE username=?`, ['admin'], (err, row) => {
  if (err) console.error(err); // 错误处理
  const pwd = process.env.ADMIN_PASSWORD || 'admin123'; // 获取管理员密码，优先使用环境变量
  const hash = bcrypt.hashSync(pwd, 10); // 对密码进行哈希处理
  if (!row) {
    // 如果管理员用户不存在，则创建
    db.run(`INSERT INTO users (username, password_hash, role) VALUES (?,?,?)`, ['admin', hash, 'admin']);
  } else if (process.env.ADMIN_PASSWORD) {
    // 如果管理员用户存在且环境变量中设置了密码，则更新密码
    db.run(`UPDATE users SET password_hash=? WHERE id=?`, [hash, row.id]);
  }
});

// 认证端点
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username=?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: '无效的凭据' }); // 用户不存在
    if (!bcrypt.compareSync(password || '', user.password_hash)) return res.status(401).json({ error: '无效的凭据' }); // 密码不匹配
    const token = jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' }); // 生成JWT令牌
    res.json({ token });
  });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.status(400).json({ error: '缺少参数' }); // 缺少参数
  /**
   * 检查密码复杂度。
   * @param {string} p - 密码字符串。
   * @returns {boolean} 如果密码符合复杂度要求则为true，否则为false。
   */
  function isPasswordComplex(p) {
    return typeof p === 'string'
      && p.length >= 8 // 至少8个字符
      && /[A-Z]/.test(p) // 包含大写字母
      && /[a-z]/.test(p) // 包含小写字母
      && /\d/.test(p) // 包含数字
      && /[^A-Za-z0-9]/.test(p); // 包含特殊字符
  }
  if (!isPasswordComplex(new_password)) {
    logAction(req.user?.username, 'password_change_failed', 'users', req.user?.uid, { reason: 'complexity' });
    return res.status(400).json({ error: '新密码不符合复杂度要求' });
  }
  const uid = req.user?.uid;
  db.get(`SELECT * FROM users WHERE id=?`, [uid], (err, user) => {
    if (err) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'db_error' });
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'user_not_found' });
      return res.status(404).json({ error: '用户不存在' });
    }
    if (!bcrypt.compareSync(old_password || '', user.password_hash)) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'wrong_old_password' });
      return res.status(401).json({ error: '旧密码不正确' });
    }
    const hash = bcrypt.hashSync(new_password, 10); // 哈希新密码
    db.run(`UPDATE users SET password_hash=? WHERE id=?`, [hash, uid], function(e2){
      if (e2) return res.status(500).json({ error: e2.message });
      try { writeEnvKey('ADMIN_PASSWORD', new_password); } catch (e) { /* 忽略写入 .env 文件的错误 */ }
      logAction(req.user?.username, 'password_change', 'users', uid);
      res.json({ ok: true });
    });
  });
});

// 音乐API管理

// 公共接口：获取可用的音乐API
app.get('/api/music/apis', (req, res) => {
  db.all(
    `SELECT * FROM music_apis WHERE enabled = 1 ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, latency ASC, id ASC`, 
    [], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

// 管理员接口：获取所有音乐API
app.get('/api/admin/music/apis', requireAuth, (req, res) => {
  db.all(`SELECT * FROM music_apis ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 管理员接口：添加音乐API
app.post('/api/admin/music/apis', requireAuth, (req, res) => {
  const { name, url, type, enabled = 1 } = req.body;
  if (!name || !url) return res.status(400).json({ error: '名称和URL是必需的' });
  
  db.run(
    `INSERT INTO music_apis (name, url, type, enabled) VALUES (?,?,?,?)`,
    [name, url, type || 'netease', enabled],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      logAction(req.user?.username, 'create', 'music_apis', id, { name, url });
      res.json({ id });
    }
  );
});

// 管理员接口：更新音乐API
app.put('/api/admin/music/apis/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, url, type, enabled } = req.body;
  
  const sets = []; // 待更新字段
  const params = []; // 待更新参数

  if (typeof name !== 'undefined') { sets.push('name=?'); params.push(name); }
  if (typeof url !== 'undefined') { sets.push('url=?'); params.push(url); }
  if (typeof type !== 'undefined') { sets.push('type=?'); params.push(type); }
  if (typeof enabled !== 'undefined') { sets.push('enabled=?'); params.push(enabled); }

  if (sets.length === 0) {
    return res.json({ changed: 0 });
  }

  sets.push('updated_at=CURRENT_TIMESTAMP'); // 添加更新时间戳
  params.push(id); // 添加ID作为WHERE条件参数
  
  db.run(
    `UPDATE music_apis SET ${sets.join(', ')} WHERE id=?`,
    params,
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'music_apis', id, { name, url, enabled });
      res.json({ changed: this.changes });
    }
  );
});

// 管理员接口：删除音乐API
app.delete('/api/admin/music/apis/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM music_apis WHERE id=?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'music_apis', id);
    res.json({ deleted: this.changes });
  });
});

// 管理员接口：检查音乐API状态
app.post('/api/admin/music/apis/check', requireAuth, async (req, res) => {
  const { id } = req.body;
  
  /**
   * 检查给定URL的API状态和延迟。
   * @param {string} url - 待检查的API URL。
   * @returns {object} 包含状态和延迟的对象。
   */
  const checkUrl = async (url) => {
    const start = Date.now(); // 记录开始时间
    try {
      // 清理URL，移除末尾斜杠
      const targetUrl = url.replace(/\/$/, '');
      // 使用 /banner 或 /search 作为轻量级检查端点
      const response = await axios.get(`${targetUrl}/banner`, { timeout: 5000 }); // 5秒超时
      const latency = Date.now() - start; // 计算延迟
      if (response.status === 200 && response.data.code === 200) {
        return { status: 'active', latency }; // API活跃
      }
      return { status: 'error', latency: 0 }; // API错误
    } catch (e) {
      return { status: 'error', latency: 0 }; // 捕获异常，API错误
    }
  };

  if (id) {
    // 检查特定的API
    db.get(`SELECT * FROM music_apis WHERE id=?`, [id], async (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: '未找到API' });
      
      const result = await checkUrl(row.url); // 检查API状态
      db.run(
        `UPDATE music_apis SET status=?, latency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [result.status, result.latency, id],
        function(e2) {
          if (e2) return res.status(500).json({ error: e2.message });
          res.json({ ...result, id });
        }
      );
    });
  } else {
    // 检查所有启用的API
    db.all(`SELECT * FROM music_apis`, [], async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const results = [];
      for (const row of rows) {
        const result = await checkUrl(row.url); // 检查每个API状态
        await new Promise((resolve) => {
          db.run(
            `UPDATE music_apis SET status=?, latency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [result.status, result.latency, row.id],
            () => resolve()
          );
        });
        results.push({ id: row.id, ...result });
      }
      res.json({ results });
    });
  }
});

// SPA Fallback - 必须是最后一个路由
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

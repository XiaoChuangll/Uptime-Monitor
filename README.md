# Vue Uptime Monitor System

本系统是一个集成了**服务监控**、**信息发布**与**数据统计**的一站式服务平台。基于 Vue 3 + Express + SQLite 开发。

## 功能特性

- **实时服务监控**：集成 UptimeRobot API，展示服务状态、响应时间及可用性统计。
- **信息发布**：内置公告系统与应用中心，方便发布通知与资源。
- **访客统计**：实时追踪在线人数，分析地理位置与设备分布。
- **后台管理**：全功能后台，支持内容管理、日志查看及环境变量配置。
- **实时交互**：基于 WebSocket 的数据实时推送。

## 部署指南

### 1. 环境准备

- Node.js >= 16.0.0
- npm 或 yarn

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 文件为 `.env`，并填入必要的配置信息：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```properties
# UptimeRobot API 配置
VUE_APP_API_URL=https://api.uptimerobot.com/v2/getMonitors
VUE_APP_API_KEY=your_uptimerobot_api_key_here

# 后端服务端口
PORT=3001

# 系统管理员密码 (用于后台登录)
ADMIN_PASSWORD=your_secure_password_here

# (可选) 加密密钥，如不设置将自动生成到 server/secret.key
# ENV_SECRET_KEY=your_hex_secret_key_here
```

### 4. 开发模式运行

同时启动前端 (Vite) 和后端 (Express) 服务：

```bash
npm run dev
```

- 前端地址: `http://localhost:5173`
- 后端地址: `http://localhost:3001`

### 5. 生产环境部署

#### 构建前端

```bash
npm run build
```

构建产物将生成在 `dist` 目录下。

#### 启动服务

生产模式下，后端服务会自动托管 `dist` 目录下的静态资源。

```bash
node server/index.cjs
```

访问 `http://localhost:3001` 即可查看完整系统。

### 6. 数据备份

系统数据存储在以下文件/目录中，建议定期备份：

- `server/visitors.db`: 访客与系统日志数据库 (SQLite)
- `server/uploads/`: 用户上传的图片与文件
- `server/secret.key`: 系统生成的加密密钥 (如果在 .env 中未指定)
- `.env`: 环境变量配置

## 目录结构说明

```
├── dist/                # 前端构建产物
├── public/              # 静态资源
├── server/              # 后端服务代码
│   ├── index.cjs        # 服务入口
│   ├── database.cjs     # 数据库配置
│   └── uploads/         # 上传文件存储
├── src/                 # 前端源码
│   ├── components/      # 公共组件
│   ├── router/          # 路由配置
│   ├── services/        # API 服务封装
│   ├── stores/          # Pinia 状态管理
│   └── views/           # 页面视图
├── .env                 # 环境变量 (私密，勿提交)
├── .env.example         # 环境变量示例
└── package.json         # 项目配置
```

## 二次开发注意事项

- **API 代理**: 开发环境下 Vite 配置了代理转发 `/api` 到后端端口。
- **数据库**: 使用 SQLite，无需安装额外数据库服务。Schema 定义在 `server/database.cjs` 中。
- **安全性**: 敏感配置请务必通过环境变量注入，不要硬编码在代码中。

## 许可证

MIT License

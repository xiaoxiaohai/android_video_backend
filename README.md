# Android Video Backend

视频平台后端服务与数据采集系统。

## 目录结构

```
├── backend/     # Node.js 后端 API 服务
├── collector/   # 数据采集模块
├── docs/        # 项目文档
└── scripts/     # 部署与运维脚本
```

## 快速开始

### 后端服务

```bash
cd backend
npm install
npm start
```

### 数据采集

```bash
cd collector
npm install
npm start
```

## 部署

```bash
backend/scripts/deploy_backend.sh
```

重载服务：
```bash
npx pm2 restart nexamedia-api
```

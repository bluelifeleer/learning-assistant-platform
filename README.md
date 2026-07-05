# Learning Assistant Platform

通用学习内容采集与笔记平台。系统包含 Chrome 插件、Python FastAPI 服务、PostgreSQL 数据库和 React 控制台。

## 合规边界

本项目只做学习资料采集、字幕整理、笔记、提醒、高亮和导出。不自动刷课，不伪造学习记录，不自动保存平台学习进度，不绕过视频播放或平台检测。

## 本地开发

1. 安装 Python 3.11+、Node.js、pnpm、PostgreSQL。
2. 复制 `.env.example` 为 `.env` 并配置 `DATABASE_URL`。
3. 在 `apps/api` 创建虚拟环境并安装依赖：`python -m venv .venv`，然后 `.\.venv\Scripts\python -m pip install -e .[dev]`。
4. 在项目根目录运行 `pnpm install`。
5. 运行 `scripts\db.ps1` 初始化数据库。
6. 运行 `scripts\dev.ps1` 启动 API 和控制台。
7. 在 Chrome 扩展管理页加载 `apps/extension` 构建结果。

## 默认端口

- API: `http://127.0.0.1:17890`
- 控制台: `http://127.0.0.1:17891`

## 主要模块

- `apps/api`: FastAPI 服务、PostgreSQL 模型、Alembic 迁移、导出器。
- `apps/extension`: Manifest V3 Chrome 插件、站点 adapter、采集浮层、安全护栏。
- `apps/console`: React 管理控制台。
- `docs/superpowers`: 设计文档和实施计划。

## 常用命令

```powershell
# 后端测试
Set-Location apps\api
.\.venv\Scripts\python -m pytest tests -q

# 插件测试和类型检查
Set-Location ..\..
pnpm --filter @learn-assistant/extension test
pnpm --filter @learn-assistant/extension build

# 控制台测试和构建
pnpm --filter @learn-assistant/console test
pnpm --filter @learn-assistant/console build
```

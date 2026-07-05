# Learning Assistant Platform

通用学习内容采集与笔记平台。系统包含 Chrome 插件、Python FastAPI 服务、PostgreSQL / MySQL 数据库和 React 控制台。

## 合规边界

本项目只做学习资料采集、字幕整理、笔记、提醒、高亮和导出。不自动刷课，不伪造学习记录，不自动保存平台学习进度，不绕过视频播放或平台检测。

## 本地开发

推荐按传统 PHP Web 项目的安装体验来跑：先准备运行环境，启动服务，进入控制台安装器，由安装器检测数据库并写入 `.env`。

1. 安装 Python 3.11+、Node.js、pnpm、Docker Desktop。
2. 在 `apps/api` 创建虚拟环境并安装依赖：`python -m venv .venv`，然后 `.\.venv\Scripts\python -m pip install -e .[dev]`。
3. 在项目根目录运行 `pnpm install`。
4. 启动一个本地数据库：`scripts\db-docker.ps1 postgresql`，或 `scripts\db-docker.ps1 mysql`。
5. 运行 `scripts\dev.ps1` 启动 API 和控制台。
6. 打开控制台 `http://127.0.0.1:17891`，未安装时会进入“系统安装向导”。
7. 在安装器里测试数据库连接，填写组织、管理员、License Key，然后初始化。
8. 在 Chrome 扩展管理页加载 `apps/extension` 构建结果。

如果你已有远端 PostgreSQL、MySQL 或 MariaDB，第 4 步可以跳过，直接在安装器里填写远端数据库地址。

## 一键数据库

本地开发默认账号保持和安装器一致：

```powershell
# PostgreSQL: 127.0.0.1:5432
scripts\db-docker.ps1 postgresql

# MySQL: 127.0.0.1:3306
scripts\db-docker.ps1 mysql

# 同时启动两种数据库
scripts\db-docker.ps1 all
```

默认连接参数：

```text
host=127.0.0.1
database=learn_assistant
username=learn_assistant
password=learn_assistant
```

## 默认端口

- API: `http://127.0.0.1:17890`
- 控制台: `http://127.0.0.1:17891`

## 主要模块

- `apps/api`: FastAPI 服务、PostgreSQL / MySQL 数据模型、Alembic 迁移、导出器。
- `apps/extension`: Manifest V3 Chrome 插件、站点 adapter、采集浮层、安全护栏。
- `apps/console`: React 管理控制台和系统安装器。
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

## 安装器流程

控制台启动后会先请求 `GET /api/v1/setup/status`：

- 已存在 `.env`、数据库连接正常、核心数据表已初始化时，直接进入业务控制台。
- 未安装或数据库不可用时，进入“系统安装向导”。
- 安装向导支持远端 PostgreSQL、远端 MySQL / MariaDB，也可以填写 Docker 或本机数据库地址。
- 初始化会写入根目录 `.env`，创建核心业务表，并创建默认组织和管理员账号。

安装向导 API：

```text
GET  /api/v1/setup/status
POST /api/v1/setup/test-database
POST /api/v1/setup/initialize
```

数据库配置字段：

```json
{
  "database_type": "postgresql",
  "host": "127.0.0.1",
  "port": 5432,
  "database": "learn_assistant",
  "username": "learn_assistant",
  "password": "learn_assistant"
}
```

MySQL / MariaDB 使用：

```json
{
  "database_type": "mysql",
  "host": "127.0.0.1",
  "port": 3306,
  "database": "learn_assistant",
  "username": "learn_assistant",
  "password": "learn_assistant"
}
```

## 验证安装器

```powershell
# 1. 启动本地 PostgreSQL
scripts\db-docker.ps1 postgresql

# 2. 启动 API 和控制台
scripts\dev.ps1

# 3. 打开控制台安装器
# http://127.0.0.1:17891
```

安装器中点击“测试数据库连接”，成功后点击“初始化系统”。初始化完成后，刷新控制台会直接进入业务界面。

# Learning Assistant Platform

通用学习内容采集与笔记平台。系统包含 Chrome 插件、Python FastAPI 服务、PostgreSQL / MySQL 数据库和 React 控制台。

## 合规边界

本项目只做学习资料采集、字幕整理、笔记、提醒、高亮和导出。不自动刷课，不伪造学习记录，不自动保存平台学习进度，不绕过视频播放或平台检测。

## 本地开发

推荐按传统 PHP Web 项目的安装体验来跑：先准备运行环境，启动服务，进入控制台安装器，由安装器检测数据库并写入 `.env`。

1. 安装 Python 3.11+、Node.js、pnpm、Docker Desktop。
2. 在 `apps/api` 创建虚拟环境并安装依赖：
   - Windows: `python -m venv .venv`，然后 `.\.venv\Scripts\python -m pip install -e .[dev]`
   - macOS / Linux: `python3 -m venv .venv`，然后 `./.venv/bin/python -m pip install -e '.[dev]'`
3. 在项目根目录运行 `pnpm install`。
4. 启动一个本地数据库：
   - Windows: `scripts\db-docker.ps1 postgresql`，或 `scripts\db-docker.ps1 mysql`
   - macOS / Linux: `./scripts/db-docker.sh postgresql`，或 `./scripts/db-docker.sh mysql`
5. 启动 API 和控制台：
   - Windows: `scripts\dev.ps1`
   - macOS / Linux: `./scripts/dev.sh`
6. 打开控制台 `http://127.0.0.1:17891`，未安装时会进入“系统安装向导”。
7. 在安装器里测试数据库连接，填写组织、管理员、License Key，然后初始化。
8. 在 Chrome 扩展管理页加载 `apps/extension` 构建结果。

如果你已有远端 PostgreSQL、MySQL 或 MariaDB，第 4 步可以跳过，直接在安装器里填写远端数据库地址。

## AI 配置

AI 摘要和自动出题使用 **OpenAI 兼容端点**，在控制台"设置 → AI 设置"中填写：

- **Base URL**：API 地址(不含 `/chat/completions`)
- **API Key**：密钥只保存在服务端,界面上只显示掩码
- **模型名**：如 `deepseek-chat`、`kimi-k2-0905-preview`、`qwen2.5:7b`
- **新章节自动生成**：开关默认关闭;开启后章节字幕满 20 段会自动生成章节摘要

常见服务示例：

| 服务 | Base URL | 说明 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | 模型 `deepseek-chat` |
| Kimi(月之暗面) | `https://api.moonshot.cn/v1` | 模型 `kimi-k2-0905-preview` 等 |
| Ollama(本地) | `http://127.0.0.1:11434/v1` | 任意已拉取模型,API Key 可填任意非空值 |

填写后点"测试连接"验证可用性。未配置时 AI 相关按钮会提示先完成配置。课程问答同样使用这里的配置。

## 邮箱配置

邮件推送(发送笔记、AI 学习总结)使用 **SMTP 授权码**,在控制台"设置 → 邮箱设置"中填写:

- **SMTP 主机 / 端口**:如 `smtp.qq.com:465`(465 端口走 SSL,其他端口自动使用 STARTTLS)
- **SMTP 账号 / 授权码**:QQ、163 等邮箱需在邮箱设置里单独开启 SMTP 并生成"授权码",不是邮箱登录密码;授权码只保存在服务端,界面上只显示掩码
- **发件地址**:可留空,默认使用 SMTP 账号
- **收件地址**:笔记和学习总结都发到这个地址
- **自动发送学习总结**:开关默认关闭;可选"每天 / 每周"和发送整点(0-23,服务器本地时间)。每天 = 每天该整点后发送当天首封;每周 = 每周一该整点后发送。API 每 15 分钟检查一次是否到期

常见邮箱示例:

| 邮箱 | SMTP 主机 | 端口 | 说明 |
|---|---|---|---|
| QQ 邮箱 | `smtp.qq.com` | 465 | 设置 → 账户 → 开启 SMTP 服务,生成授权码 |
| 163 邮箱 | `smtp.163.com` | 465 | 设置 → POP3/SMTP/IMAP → 开启 SMTP,获取授权码 |
| Gmail | `smtp.gmail.com` | 587 | 需开启两步验证后创建"应用专用密码"(App Password) |

填写后点"发送测试邮件"验证可用性。未配置时,发送笔记和学习总结会提示先完成配置;学习总结内容若已配置 AI,会由 AI 生成"学习重点总结"段落,否则使用统计数据模板。

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

macOS / Linux:

```bash
# PostgreSQL: 127.0.0.1:5432
./scripts/db-docker.sh postgresql

# MySQL: 127.0.0.1:3306
./scripts/db-docker.sh mysql

# 同时启动两种数据库
./scripts/db-docker.sh all
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

## 功能特性

- **课程采集**:插件自动上报课程结构(章/节两级章节树)、字幕文本(页面字幕 / track 字幕文件)和播放事件;支持"外壳页面 + 播放器 iframe"结构的学习平台,章节树动态渲染后自动补报。
- **时间点笔记**:学习页浮层点击"添加笔记",保存时自动带上视频当前时间点;控制台笔记页提供 Markdown 编辑器(工具栏、实时预览、图片粘贴/上传),课程详情页按章节查看字幕、笔记和截图。
- **截图存证**:浮层"截图存证"一键截取当前画面并关联课程/章节/视频时间点;课程详情页缩略图网格展示,弹层查看器支持左右按钮和 ←/→ 键切换、Esc 关闭。适合 PPT 课件类无字幕轨的视频。
- **复习记忆**:笔记可一键生成复习卡片(正面为笔记,背面为该时间点附近字幕),控制台"复习"页按简化 SM-2 间隔重复算法抽认;"导出"页支持 Anki TSV 格式,可直接导入 Anki。
- **AI 摘要**:基于章节字幕一键生成章节摘要(摘要、大纲、知识点清单),课程级摘要由章节摘要自动聚合;字幕超长章节自动分块处理。支持手动触发生成,也可在设置中开启"新章节自动生成"。
- **AI 出题**:基于章节字幕自动生成问答闪卡(直接进入复习到期队列)和选择题/判断题(控制台"测验"页作答判分);同一章节的重复生成请求会自动去重。
- **掌握度统计**:测验作答后自动记录答题明细,"掌握度"按章节聚合答题总数、正确率和最近作答时间,支持按课程过滤,直观定位薄弱章节。
- **学习档案 PDF 导出**:导出格式新增"学习档案 PDF"(report_pdf),按课程汇总章节学习时长、笔记数、截图数、测验正确率和 AI 摘要提取的学习重点;可导出单门课程或全部课程总档案,中文排版无需额外字体文件。
- **邮件推送**:配置 SMTP(QQ / 163 / Gmail 授权码)后可一键把带字幕上下文的笔记发送到邮箱;AI 学习总结统计近期笔记、学习时长、复习、测验与到期卡片,支持手动立即发送和按"每天 / 每周"定时自动发送。
- **课程问答**:在课程详情页对课程内容直接提问,系统检索相关字幕后由 AI 生成中文回答,引用处带 [mm:ss] 时间点并列出出处章节与字幕摘录;支持多轮对话上下文,可限定单章范围。
- **全文搜索**:控制台"搜索"页同时检索笔记和字幕内容,结果带课程/章节/时间点。
- **学习统计**:控制台"总览"页展示课程、笔记、字幕、播放事件总量和近 7 天每日活动。
- **导出**:Markdown / JSON / Anki / 学习档案 PDF 四种格式,导出任务同步生成文件,可在控制台直接下载。
- **在线状态自愈**:插件后台每分钟周期心跳(chrome.alarms),API 重启后插件自动恢复在线,无需手动重连。
- **安全**:全部业务接口 Bearer 鉴权、安装向导安装后锁定、注册开关默认关闭、token 可吊销、pepper 随机生成。

## 数据库迁移

安装器初始化会自动执行 Alembic 迁移。已有安装升级代码后,需要手动应用新迁移:

```powershell
Set-Location apps\api
.\.venv\Scripts\python -m alembic upgrade head
```

macOS / Linux:

```bash
cd apps/api
./.venv/bin/python -m alembic upgrade head
```

## 开放注册

注册接口默认关闭(`ALLOW_REGISTRATION=false`),账号通过安装器创建的管理员登录。如需开放注册,在 API 环境中设置 `ALLOW_REGISTRATION=true` 后重启 API。

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

macOS / Linux:

```bash
# 1. 首次使用时赋予执行权限
chmod +x scripts/*.sh scripts/*.command

# 2. 启动本地 PostgreSQL
./scripts/db-docker.sh postgresql

# 3. 启动 API 和控制台
./scripts/dev.sh

# 4. 打开控制台安装器
# http://127.0.0.1:17891
```

macOS 也可以双击 `scripts/start-macos.command` 启动；Linux 桌面环境可运行 `./scripts/start-linux.sh`。

安装器中点击“测试数据库连接”，成功后点击“初始化系统”。初始化完成后，刷新控制台会直接进入业务界面。

## 插件绑定流程

1. 启动 API 和控制台：Windows 使用 `scripts\dev.ps1`，macOS / Linux 使用 `./scripts/dev.sh`。
2. 打开控制台 `http://127.0.0.1:17891`，在“插件绑定”面板点击“生成插件 Token”。
3. 在浏览器扩展管理页找到 `Learning Assistant`，点击“详细信息”或“扩展选项”。
4. 在 Options 页面填写：
   - API 地址：`http://127.0.0.1:17890/api/v1`
   - 插件 Token：控制台刚生成的 `lap_...`
   - 启用的网站 adapter：按需勾选 `wencai-school`、`generic-dom-course`、`generic-video`（默认全部启用）
5. 点击“测试连接”，成功后点击“保存配置”。
6. 回到学习页面刷新，浮层会读取配置并向 `/api/v1/plugin-heartbeat` 上报在线状态。
7. 播放视频时点击浮层的“添加笔记”，可保存带当前视频时间点的笔记，稍后在控制台“课程 → 详情”中查看，并可生成复习卡片。

Token 明文只在生成时显示一次；如果丢失，重新生成一个新的 Token 并在扩展选项里覆盖即可。

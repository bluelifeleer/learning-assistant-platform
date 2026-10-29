# 开发引导

> 面向接手这个仓库的人：怎么把环境跑起来、代码怎么组织、测试怎么写、CI 与部署怎么落地。
> 现状与计划用标记区分：**✅ 已就绪** / **🚧 计划中**（本轮要做的工程化工作）。
>
> 相关文档：功能设计见 [`docs/superpowers/specs/`](superpowers/specs/)，导入导出包规范见
> [`2026-10-28-import-export-package.md`](superpowers/specs/2026-10-28-import-export-package.md)。

## 1. 项目是什么

学习内容采集与笔记平台，三个可独立运行的部分 + 一个共享数据库：

| 部分 | 路径 | 技术栈 | 端口 |
|---|---|---|---|
| API | `apps/api` | FastAPI + SQLAlchemy 2 + Alembic（PostgreSQL / MySQL） | 17890 |
| 控制台 | `apps/console` | React 18 + Vite 5 + TypeScript，vitest | 17891（dev） |
| 浏览器插件 | `apps/extension` | Manifest V3 + esbuild，vitest | — |
| 数据库 | `docker-compose.yml` | postgres:16 / mysql:8.4（仅本地开发用） | 5432 / 3306 |

合规边界写在 README 顶部：只做采集、整理、笔记、提醒、高亮、导出；不刷课、不伪造学习记录。

## 2. 五分钟跑起来

```powershell
# 1) 后端依赖（Windows）
cd apps\api
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .[dev]

# macOS / Linux: python3 -m venv .venv && ./.venv/bin/python -m pip install -e '.[dev]'
```

```powershell
# 2) 前端依赖（仓库根目录）
pnpm install

# 3) 本地数据库（二选一）
scripts\db-docker.ps1 postgresql      # macOS/Linux: ./scripts/db-docker.sh postgresql
scripts\db-docker.ps1 mysql

# 4) 启动 API + 控制台（会自动执行 alembic upgrade head）
scripts\dev.cmd                       # 或 scripts\dev.ps1；macOS/Linux: ./scripts/dev.sh
```

打开 <http://127.0.0.1:17891>，首次进入安装向导：填数据库连接 → 组织 / 管理员 / License → 初始化。
初始化会写入 `.env`，**之后 `.env` 属于本机配置，不要提交**（已在 `.gitignore`）。

**自检清单**（都通过说明环境没问题）：

```powershell
curl http://127.0.0.1:17890/api/v1/health          # {"status":"ok",...}
cd apps\api; .\.venv\Scripts\python -m pytest tests -q   # 263 passed
pnpm --filter @learn-assistant/console test        # 181 passed
pnpm --filter @learn-assistant/extension test      # 21 个测试文件
```

### Windows 特有坑

- **执行策略**：直接 `.\scripts\dev.ps1` 可能报 `not digitally signed`。用 `scripts\dev.cmd`（只对子进程 Bypass），或 `powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1`。
- **代理/MITM**：开着 Charles、mitmproxy、Fiddler 时，Python 只信任 certifi，AI 测试连接会报
  `CERTIFICATE_VERIFY_FAILED`。`.env` 里二选一：`LLM_DISABLE_PROXY=true`（直连）或
  `LLM_CA_BUNDLE=<pem>`（信任代理根证书）。

## 3. 代码组织

```
apps/api
  app/main.py              create_app()：注册路由、CORS、lifespan（任务回收 + 定时器）
  app/routes/*.py          每个文件一个资源域，Router 前缀在 main.py 统一加 /api/v1
  app/services/*.py        业务逻辑（auth、capture、importer、exporter…）
  app/exporters/*.py       纯渲染器：文档 → markdown/json/anki/pdf/zip
  app/models/entities.py   全部 ORM 模型（单文件，便于看清外键关系）
  app/schemas/*.py         Pydantic 入参/出参
  alembic/versions/        迁移，命名 00NN_描述.py（当前 24 个）
  tests/                   pytest，28 个文件

apps/console/src
  api/client.ts            所有 HTTP 调用 + 类型（单一出口，便于统一鉴权/错误处理）
  pages/*.tsx              页面；*.test.tsx 为 SSR 结构测试
  components/              图标、Toast、背景等
  navSlug.ts               导航项与 hash 路由（新增页面要同时改这里 + App.tsx + icons.tsx）

apps/extension/src
  adapters/                站点适配器（wencai 等）
  capture/                 字幕、截图、章节快照的采集实现
  ui/                      采集浮层
  safety/                  护栏（阻断支付/授权/外链等）
```

### 三条容易踩的约定

1. **改后端接口后必须手动重启**：uvicorn 没开 `--reload`。`scripts\dev.cmd` 里 API 与 vite 是两个后台作业，改 Python 代码后按一次 Ctrl+C 重跑最简单。
2. **后台任务用自己的会话**：导入/导出的后台任务通过模块级 `SessionLocal` 取会话。测试里
   `conftest.py` 的 autouse fixture 已把它替换成测试库——新增后台任务时**沿用这个模式**（`session_factory` 参数 + 模块级 `SessionLocal`），否则测试会写进真实数据库。
3. **新增页面**要同时改四处：`navSlug.ts`（navItems + PAGE_TO_SLUG）、`App.tsx`（WorkspacePage 分支）、
   `components/icons.tsx`（导航图标）、`pages/` 下新文件。

## 4. 测试体系

三层，职责严格分开：

| 层 | 工具 | 覆盖什么 | 数量 |
|---|---|---|---|
| 后端 | pytest + TestClient | 接口、权限、迁移、导出/导入全流程、纯函数 | 263 测试 / 28 文件 |
| 前端 | vitest | 纯逻辑、API 客户端（mock fetch）、页面 SSR 结构 | 181 测试 / 23 文件 |
| 扩展 | vitest | 适配器解析、护栏、字幕/截图采集、心跳 | 21 文件 |
| 端到端 | 🚧 Playwright | 真实浏览器里的用户路径 | 待建 |

### 各层能测什么、不能测什么

- 后端：能测一切服务端行为。**不能**验证浏览器行为（CORS 头、localStorage 会话、渲染）。
- 前端 vitest：**没有 jsdom**（依赖里没装），所以只能做 SSR 字符串断言和 mock fetch 的客户端测试。
  **需要"点击 → 状态变化"的验证一律去 e2e**，不要为了单测去装 jsdom。
- 扩展 vitest：纯逻辑与消息协议；真正"装进浏览器加载到页面"要 e2e。

### 写测试的约定

- 后端：用 `client` / `auth_headers` / `session_factory` fixture；`auth_headers` 会把用户提成 owner，
  访问设置类接口才不会被 403 拦住。**不要连真实网络**，外部服务一律 monkeypatch。
- 前端：`vi.stubGlobal("fetch", mock)`；断言 URL 与 body，而不是快照整个组件树。
- 迁移：新增迁移后要保证 `alembic upgrade head` 在**空库**与**已有库**上都通过（`tests/test_setup.py` 覆盖空库路径）。
- 后台任务：写测试时断言"任务结束后 DB 的状态"，不要依赖执行时序；TestClient 会等后台任务跑完再返回。

## 5. 代码风格与 lint（✅ 已接入）

```powershell
cd apps\api; .\.venv\Scripts\python -m ruff check app tests   # macOS/Linux: .venv/bin/python -m ruff check app tests
pnpm --filter @learn-assistant/console lint                   # 根目录：pnpm lint
```

| 语言 | 工具 | 规则 | 说明 |
|---|---|---|---|
| Python | ruff（`apps/api/pyproject.toml`） | `E,F,I,B,UP`，行宽 120 | 忽略 `B008`（FastAPI `Depends()` 的误报）与 `E501`（行宽留给后续 `ruff format` 单独一轮） |
| TS/React | eslint 9 flat config（`apps/console/eslint.config.js`） | recommended + typescript-eslint + `react-hooks` | 未开类型感知；`no-explicit-any` 为 warning；`pnpm lint` 以"零 error"为通过 |

现状：ruff 全绿，eslint 0 error / 4 warning（`react-hooks/exhaustive-deps` 的历史遗留，集中在
App.tsx、CourseDetail.tsx、PluginPanel.tsx，属于刻意省略依赖的写法）。**lint 门禁只看 error**，
warning 留作后续清理，不要在修 bug 的提交里顺手改依赖数组。

格式化统一留给各语言的 formatter，不要在同一次提交里既改逻辑又排版。


## 6. CI：GitHub Actions（🚧 计划中）

目标：任何 push/PR 都自动跑完后端、前端、扩展、e2e 与 lint，主分支只接受通过的 PR。

```yaml
# .github/workflows/ci.yml（草案）
on:
  push: { branches: ["**"] }
  pull_request:
  workflow_dispatch:
concurrency: { group: "ci-${{ github.ref }}", cancel-in-progress: true }
```

| job | 矩阵 | 步骤要点 | 约耗时 |
|---|---|---|---|
| `api` | Python 3.11 / 3.12 / 3.13 | `pip install -e .[dev]` → 起 **postgres:16 service** → `alembic upgrade head` → `pytest -q` | 3–4 min ×3 |
| `api-mysql` | Python 3.13 | 起 **mysql:8.4 service** → `alembic upgrade head` + 冒烟（MySQL 分支目前只有本地验证） | 3 min |
| `web` | Node 20 | `pnpm install --frozen-lockfile` → console `tsc` + `vitest` + `vite build`；extension `test` + `build`；上传 dist 作为 artifact | 3 min |
| `e2e` | Node 20 + Python 3.13 | 依赖 `api`/`web` 产物；`npx playwright install --with-deps chromium`；跑 `e2e/` | 5–8 min |
| `lint` | — | `ruff check` + `eslint`（第 5 节落地后启用） | 1 min |

关键设计点：

- **迁移必须在真 Postgres 上跑一次**。现有 263 个测试全用 sqlite，迁移里的 `ALTER`/`JSON`/`server_default`
  在 PG 与 sqlite 上的行为并不一致，这是当前最大的盲区。
- **缓存**：`actions/setup-node` 的 pnpm 缓存 + `~/.cache/pip`；不要缓存 `.venv`。
- **path 过滤**：只改 `docs/**` 时跳过代码 job（用 `paths-ignore` 或 `dorny/paths-filter`）。
- **分支保护**：`api`、`web`、`e2e`、`lint` 四个 check 设为必需；合并前必须绿。
- 公开仓库 Actions 免费；私有仓库按分钟计费，四 job 单次约 12–15 分钟，够用。

## 7. e2e：Playwright（✅ 已落地）

```powershell
pnpm test:e2e              # 全部（控制台 + 扩展）
pnpm test:e2e:console      # 只跑控制台
pnpm test:e2e:extension    # 只跑扩展
```

不需要手工起服务：`playwright.config.ts` 的 `webServer` 会拉起三个进程——

| 进程 | 端口 | 说明 |
|---|---|---|
| API | 17899 | `e2e/scripts/start-api.mjs`：**每次重建独立 sqlite 库** → `alembic upgrade head` → 跑种子 → uvicorn |
| 控制台 | 17892 | `e2e/scripts/start-console.mjs`：vite dev，`VITE_API_BASE_URL` 指向 17899 |
| 假学习站点 | 17893 | `e2e/scripts/start-site.mjs`：静态页，路径带 `/learn` 以命中扩展适配器 |

**绝不连真实数据库**：`scripts/seed_e2e.py` 拒绝非 sqlite 的 `DATABASE_URL`，所有产物都在 `e2e/.tmp/`（已 gitignore）。

### 目录

```
e2e/
  scripts/start-api.mjs / start-console.mjs / start-site.mjs
  fixtures/site/learn/course.html      假学习站点（h1 + 章节列表 + video + 字幕）
  specs/console/{auth,courses,notes,review,quiz,search,settings,transfer}.spec.ts
  specs/extension/{options,overlay}.spec.ts
  specs/extension/fixtures.ts          launchPersistentContext 加载扩展 dist
```

### 覆盖情况

| 控制台 | 用例数 | 扩展 | 用例数 |
|---|---|---|---|
| 登录/登出/密码错误/显示密码 | 5 | 选项页加载与适配器列表 | 1 |
| 课程列表/详情/筛选/归档 | 3 | 保存配置（无 Token 提示、持久化读回） | 2 |
| 笔记列表/关键词/标签 | 2 | 浮层注入与未绑定提示 | 1 |
| 测验作答/题目管理 | 2 | 绑定后浮层状态 | 1 |
| 复习抽认 | 1 | | |
| 搜索（笔记+字幕、空态） | 2 | | |
| 设置（标题唯一、标签页、AI 预设、保存） | 3 | | |
| 导入导出（导出→下载→预览→合并、清理入口） | 2 | | |

合计 **25 条**。仍未覆盖：扩展的字幕上报与护栏（需要真实插件 Token 与后端联调），
留作后续；不要为了凑数写只断言"页面能打开"的用例。

### 约定

- 选择器只用 `getByRole` / `getByLabel` / `getByPlaceholder`，不绑 class
- 等待一律 `expect(...).toBeVisible()`，禁止 `waitForTimeout`
- 会改数据的用例自己负责还原（例如课程归档用例末尾点了"恢复"）
- 失败自动留 `test-results/<用例>/`：截图、trace、页面快照
- 串行执行（`workers: 1`）：后台任务与共享 sqlite 库不适合并行


## 8. 部署：单机 compose（✅ 已落地）

本地开发方式**没有变**：仍然是 `scripts\dev.cmd` / `./scripts/dev.sh`（uvicorn 17890 + vite 17891）。
Docker 是另一条路径，用 `docker-compose.prod.yml`，不改任何 dev 脚本。

### 拓扑

```
            ┌──────────────┐        ┌───────────────────┐
  浏览器 ──▶│ web (nginx)  │──/api─▶│ api (uvicorn)     │──▶ postgres
            │ 静态 dist    │        │ alembic upgrade   │
            └──────────────┘        └───────────────────┘
                                        │ volumes: exports / screenshots / note_images
```

### 文件

| 文件 | 内容 |
|---|---|
| `apps/api/Dockerfile` | `python:3.12-slim`；非 root（uid 10001）；`pip install .`；三个媒体目录指向 `/data/*` 卷；`HEALTHCHECK` 打 `/api/v1/health` |
| `apps/api/docker-entrypoint.sh` | 先 `alembic upgrade head` 再 `exec uvicorn`；迁移失败容器直接退出 |
| `apps/console/Dockerfile` | 多阶段：node:20 + pnpm workspace 构建 → nginx:alpine（构建参数 `VITE_API_BASE_URL=/api/v1`） |
| `apps/console/nginx.conf` | SPA fallback + `/api/` 反代 `api:17890` + `client_max_body_size 210m`（导入包上限） |
| `docker-compose.prod.yml` | postgres + api + web；`env_file: .env.production`；四个命名卷；健康检查依赖顺序 |
| `.env.production.example` | 部署用环境变量模板（含 pepper 与密码说明） |
| `.dockerignore` | 构建上下文是仓库根，排除 `.venv` / `node_modules` / `dist` / 媒体目录 |

### 启动

```bash
cp .env.production.example .env.production
# 改 POSTGRES_PASSWORD 与 API_TOKEN_PEPPER（openssl rand -hex 32）
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

### 部署相关的代码约束

1. **前端基址**：`client.ts` 读 `VITE_API_BASE_URL`，未设置时用 `http://127.0.0.1:17890/api/v1`（本地开发行为不变）。
2. **生产自检**：`APP_ENV=production` 且 pepper 仍是默认值/过短时，`create_app()` 直接抛错拒绝启动；
   开发/测试环境跳过（`app/core/config.py: ensure_safe_config`，`tests/test_config_guard.py` 覆盖）。
3. **单副本假设**：迁移在容器入口执行，多副本同时启动会并发迁移；要扩副本时改成独立迁移 job，
   并把 `JOB_RECOVERY_GRACE_SECONDS` 调大。

### 备份与恢复

```powershell
.\scripts\backup.ps1 -Out D:\backups -Keep 7
.\scripts\restore.ps1 .\backups\learn-assistant-20261029-200000
```

```bash
./scripts/backup.sh --out /var/backups --keep 7
./scripts/restore.sh backups/learn-assistant-20261029-200000
```

- 逻辑只有一份：`scripts/backup.py` / `scripts/restore.py`；`.ps1` 与 `.sh` 只是找 Python 的入口
- 备份 = `pg_dump -Fc` + `tar -czf /data/{exports,screenshots,note_images}` + `checksums.sha256` + `manifest.json`
- 恢复前强制校验 checksums；中途失败会中止，不会"悄悄恢复一半"
- 恢复流程：停 `api`/`web` → `DROP SCHEMA public CASCADE` → `pg_restore --no-owner` → 解包媒体 → 重新拉起
- 纯逻辑（env 解析、校验和、清理策略、清单字段）有单测：`apps/api/tests/test_backup_scripts.py`


### 关键环境变量（`.env.production`）

```ini
APP_ENV=production
DATABASE_URL=postgresql+psycopg://learn_assistant:<password>@postgres:5432/learn_assistant
API_TOKEN_PEPPER=<openssl rand -hex 32>
ALLOW_REGISTRATION=false
JOB_RECOVERY_GRACE_SECONDS=0        # 单容器单进程
EXPORT_RETENTION_COUNT=50           # 按需
```

### 升级与备份

- 升级：`docker compose -f docker-compose.prod.yml pull && up -d`；迁移在容器启动时自动执行。**单副本**部署时安全；将来多副本要改成独立迁移 job。
- 备份：每日 `scripts/backup.sh`（`pg_dump -Fc` + `tar` 媒体目录）；恢复演练至少做过一次再上线。
- 监控最低要求：容器健康检查 + 磁盘占用（导出与截图会持续增长，`EXPORT_RETENTION_*` 只清导出，不清截图）。

## 9. 提交与发布

- 分支：功能分支开发，PR 合并到主干；本仓库当前使用 `feature/learning-assistant-platform`。
- **提交信息**：Conventional Commits + 中文描述，例如
  `feat(import): 支持导入到指定课程，并对重复包给出提示`；正文写"为什么"和"影响面"，不要只写"fix bug"。
- 一个提交只做一件事：逻辑改动与批量格式化分开。
- PR 检查单：测试通过 → 迁移影响面说明 → 是否需要重启 → 文档/`.env.example` 是否同步。
- 版本号目前单点维护：`apps/api/pyproject.toml`、`apps/api/app/main.py`、`apps/api/app/services/export_payload.py`
  的 `APP_VERSION`（有测试校验前两者一致）。发版前统一改这三处。

## 10. 排障 FAQ

| 现象 | 原因 | 处理 |
|---|---|---|
| `dev.ps1` 报 not digitally signed | 终端执行策略 AllSigned | 用 `scripts\dev.cmd` |
| 登录 401，密码确认没错 | 中文输入法打了全角 `＠`；或连续失败触发 5 分钟限流 | 用「显示密码」核对；等 5 分钟 |
| AI 测试连接 `CERTIFICATE_VERIFY_FAILED` | 本机抓包代理 MITM | `LLM_DISABLE_PROXY=true` 或 `LLM_CA_BUNDLE` |
| 导入/导出记录一直"处理中" | 服务重启导致任务中断 | 新版本启动时会自动标记失败；旧版本需手工改状态 |
| pytest 报 `PermissionError: ...\pytest-of-*` | Windows 沙箱/ACL 不允许建临时目录 | 加 `--basetemp=.pytest-tmp` |
| `git push` 报 `couldn't create signal pipe` | 受限环境不允许凭据管理器建管道 | 在普通终端里推送 |
| 迁移冲突（多个 head） | 两个分支同时加迁移 | `alembic heads` 看分叉，手工写 merge 迁移统一 |

## 11. 工程化路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| P1 | lint：ruff + eslint 接入（存量已清理） | ✅ 完成（eslint 4 个历史 warning 待清） |
| P2 | 单机 Docker 部署：Dockerfile + `docker-compose.prod.yml` + 生产配置自检 | ✅ 文件已就绪（本机无 Docker，镜像构建待在有 Docker 的机器上验证一次） |
| P3 | 备份脚本 `scripts/backup.*` / `restore.*`（Windows 与 macOS/Linux 入口） | ✅ 完成（pg_dump/pg_restore 部分需 Docker 环境实跑） |
| P4 | Playwright e2e（控制台 8 组 + 插件 2 组）+ `seed_e2e.py` | ✅ 完成 25 条（插件字幕上报与护栏未覆盖） |
| P5 | GitHub Actions CI（`api` 矩阵 + 真 Postgres 迁移、`api-mysql`、`web`、`lint`、`e2e`） | 🚧 最后做 |
| P6（可选） | 单容器交付形态（API 托管 console dist）、Caddy TLS、多副本共享队列 | 按交付需要 |

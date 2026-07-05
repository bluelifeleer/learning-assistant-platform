# 通用学习助手平台设计

日期：2026-07-05

## 目标

建设一个可商业化、可扩展的通用学习内容采集与笔记平台。系统由 Chrome 插件、Python 本地/私有化服务、PostgreSQL 数据库和 Web 管理控制台组成。第一版以文才学校学习平台作为真实适配样例，但整体架构不能写死到单一站点。

产品定位是辅助学习资料整理：识别课程、章节、视频状态、字幕/页面文本变化，保存为可检索的学习资料、笔记和时间线，并在关键节点提醒用户手动处理平台动作。

## 合规边界

系统不得实现或暗示以下能力：

- 不伪造课程观看记录、学习成绩、章节完成状态。
- 不绕过视频播放、计时、平台检测或学习限制。
- 不自动点击“保存学习进度”“开始学习”“继续学习”“下一章”等会改变平台学习记录的按钮。
- 不批量静默播放课程，不模拟无人值守学习。
- 不采集账号密码、Cookie、Token 等敏感凭据。

系统允许实现以下辅助能力：

- 识别课程与章节结构。
- 在用户正常观看过程中记录字幕、可见文本、播放时间线和手动笔记。
- 视频结束时提醒用户手动保存学习进度。
- 高亮下一章节或给出下一步建议，但必须由用户确认。
- 本地/私有化保存、搜索、导出学习资料。

## 用户与商业化模型

第一版同时支持单机私有化部署和后续 SaaS 化扩展。

核心对象：

- 用户：登录控制台、绑定插件、查看自己的学习资料。
- 组织：学校、培训机构、企业客户或个人工作区。
- 成员关系：用户在组织中的角色，包括 owner、admin、member。
- 授权许可：license key、试用期、设备绑定、功能套餐。
- 站点适配器：每个学习平台一个 adapter，可内置或后续通过市场扩展。

第一版可先实现最小授权骨架：本地管理员账号、API Token、license 字段和套餐字段保留。正式商业化时再接入支付、在线激活、云端 license 校验。

## 系统架构

系统包含四个主要模块：

1. Chrome 插件
   - 使用 Manifest V3。
   - content script 注入学习平台页面。
   - adapter 框架识别不同平台。
   - 插件浮层展示当前识别结果、录制状态、提醒、手动笔记入口。
   - 将采集事件通过 HTTP API 发送到 Python 服务。

2. Python 服务
   - 使用 FastAPI。
   - 提供 `/api/v1` 版本化 API。
   - 负责鉴权、数据接收、数据查询、导出、适配器配置、审计日志。
   - 支持本地运行，也预留 Docker/服务器部署。

3. PostgreSQL 数据库
   - 作为第一版正式数据存储。
   - 使用 Alembic 管理迁移。
   - 建模覆盖多用户、多组织、多站点、多课程、多章节、字幕、笔记和审计。

4. Web 管理控制台
   - 使用 Vite + React + TypeScript。
   - 面向运营和用户查看学习资料。
   - 支持课程列表、章节详情、字幕搜索、播放时间线、笔记、导出、站点适配器管理、用户/授权管理。

## Chrome 插件设计

插件不直接绑定文才学校页面，而是通过 adapter 注册表工作。

Adapter 接口：

- `id`：适配器唯一标识。
- `name`：展示名称。
- `matches(url)`：判断当前页面是否适用。
- `detectPageType(document, location)`：识别入口页、课程页、课件列表页、播放页等。
- `extractCourse(document)`：提取课程名称、平台课程 ID、学期、教师等信息。
- `extractChapters(document)`：提取章节树。
- `findVideo(document)`：定位 video 或播放器容器。
- `extractTranscript(document)`：提取字幕或页面可见讲稿文本。
- `extractCurrentChapter(document)`：识别当前章节。
- `getNextChapterHint(document)`：给出下一章节候选元素和标题，仅用于高亮或提示。

插件内置三个 adapter：

- `generic-video`：通用 HTML5 视频页面，适合多数普通网页。
- `generic-dom-course`：通用课程目录页面，使用标题、列表和视频元素启发式识别。
- `wencai-school`：文才学校平台专用适配器，作为第一版真实站点验证。

插件浮层功能：

- 当前站点和 adapter 状态。
- 当前课程、章节、视频状态。
- 字幕采集开关。
- 手动添加笔记。
- 保存到服务的状态提示。
- 视频结束提醒：“请手动点击平台的保存学习进度按钮”。
- 下一节提示与高亮按钮。

插件禁止执行的动作：

- 不调用平台保存进度接口。
- 不自动点击影响平台成绩的按钮。
- 不修改 video 播放速率来规避平台规则。
- 不隐藏平台提示或干扰平台检测逻辑。

## Python 服务设计

服务使用 FastAPI，目录建议：

- `apps/api/app/main.py`：FastAPI 入口。
- `apps/api/app/core`：配置、鉴权、日志、安全。
- `apps/api/app/db`：数据库连接、迁移集成。
- `apps/api/app/models`：SQLAlchemy 模型。
- `apps/api/app/schemas`：Pydantic 请求/响应模型。
- `apps/api/app/routes`：API 路由。
- `apps/api/app/services`：业务服务。
- `apps/api/app/exporters`：Markdown/JSON/后续 Excel 导出。
- `apps/api/tests`：后端测试。

关键 API：

- `POST /api/v1/auth/tokens`：创建或校验插件 API Token。
- `GET /api/v1/sites`：站点列表。
- `POST /api/v1/capture/course-snapshot`：插件上报课程和章节快照。
- `POST /api/v1/capture/video-event`：插件上报播放、暂停、结束、提醒等事件。
- `POST /api/v1/capture/transcript-segment`：插件上报字幕/文本片段。
- `POST /api/v1/notes`：创建笔记。
- `GET /api/v1/courses`：课程列表。
- `GET /api/v1/courses/{course_id}`：课程详情。
- `GET /api/v1/chapters/{chapter_id}/timeline`：章节时间线。
- `GET /api/v1/search/transcripts`：字幕搜索。
- `POST /api/v1/exports`：创建导出任务。
- `GET /api/v1/exports/{export_id}/download`：下载导出文件。
- `GET /api/v1/audit-logs`：审计日志。

鉴权：

- 插件使用 API Token。
- 控制台使用登录会话或 Bearer Token。
- Token 仅用于本系统服务，不读取学习平台凭据。

## PostgreSQL 数据模型

核心表：

- `organizations`
  - `id`
  - `name`
  - `plan`
  - `license_key`
  - `license_status`
  - `created_at`

- `users`
  - `id`
  - `email`
  - `display_name`
  - `password_hash`
  - `created_at`

- `memberships`
  - `id`
  - `organization_id`
  - `user_id`
  - `role`

- `api_tokens`
  - `id`
  - `organization_id`
  - `user_id`
  - `token_hash`
  - `name`
  - `last_used_at`
  - `revoked_at`

- `sites`
  - `id`
  - `adapter_id`
  - `name`
  - `host_patterns`
  - `status`

- `courses`
  - `id`
  - `organization_id`
  - `site_id`
  - `external_course_id`
  - `title`
  - `term`
  - `metadata`
  - `created_at`
  - `updated_at`

- `chapters`
  - `id`
  - `course_id`
  - `parent_id`
  - `external_chapter_id`
  - `title`
  - `sort_order`
  - `duration_seconds`
  - `metadata`

- `video_sessions`
  - `id`
  - `course_id`
  - `chapter_id`
  - `user_id`
  - `started_at`
  - `ended_at`
  - `duration_watched_seconds`
  - `source_url`

- `timeline_events`
  - `id`
  - `video_session_id`
  - `event_type`
  - `video_time_seconds`
  - `payload`
  - `created_at`

- `transcript_segments`
  - `id`
  - `course_id`
  - `chapter_id`
  - `video_session_id`
  - `start_seconds`
  - `end_seconds`
  - `text`
  - `source`
  - `created_at`

- `notes`
  - `id`
  - `course_id`
  - `chapter_id`
  - `user_id`
  - `video_time_seconds`
  - `content`
  - `created_at`

- `exports`
  - `id`
  - `organization_id`
  - `user_id`
  - `course_id`
  - `format`
  - `status`
  - `file_path`
  - `created_at`

- `audit_logs`
  - `id`
  - `organization_id`
  - `user_id`
  - `action`
  - `resource_type`
  - `resource_id`
  - `payload`
  - `created_at`

## 控制台设计

控制台是工作型产品界面，重点是扫描、检索和导出，不做营销式首页。

第一屏为仪表盘：

- 左侧导航：课程、字幕、笔记、导出、站点适配器、用户与授权、设置。
- 主区域：最近课程、最近采集事件、待处理提醒、导出状态。
- 顶部：当前组织、API 服务状态、插件连接状态。

核心页面：

- 课程列表：按站点、学期、采集时间筛选。
- 课程详情：章节树、学习时间线、字幕片段、笔记。
- 字幕搜索：跨课程全文搜索，按时间和章节定位。
- 导出中心：导出 Markdown、JSON，后续扩展 Excel。
- 站点适配器：查看内置 adapter、启用状态、匹配域名。
- 授权设置：组织信息、套餐字段、license 状态。

## 数据流

1. 用户打开学习平台页面。
2. Chrome 插件根据 URL 和 DOM 选择 adapter。
3. 插件识别课程、章节、视频和字幕区域。
4. 插件将课程快照发送到 Python 服务。
5. 用户播放视频时，插件记录播放事件和字幕变化。
6. Python 服务写入 PostgreSQL。
7. 视频结束后，插件提醒用户手动保存平台学习进度。
8. 用户打开控制台查看课程资料、搜索字幕、补充笔记、导出文件。

## 部署与开发体验

第一版提供 Windows 友好的启动方式：

- `.env.example`：配置数据库、服务端口、控制台地址。
- `scripts/dev.ps1`：启动 API、控制台、打开浏览器。
- `scripts/db.ps1`：初始化数据库、运行迁移。
- `scripts/open-learning-site.ps1`：打开默认学习网站。

本地默认端口：

- API：`http://127.0.0.1:17890`
- 控制台：`http://127.0.0.1:17891`
- PostgreSQL：使用本机或 Docker 提供的实例，连接串通过 `.env` 配置。

## 测试策略

后端测试：

- API Token 鉴权。
- 课程快照 upsert。
- 章节树保存。
- 字幕片段去重。
- 播放事件写入。
- Markdown/JSON 导出。
- 多组织数据隔离。

插件测试：

- adapter 匹配逻辑。
- 通用 video 页面识别。
- 文才学校页面 DOM 识别。
- 字幕去重与时间戳记录。
- 禁止动作约束：不自动点击平台保存/开始/继续/下一章按钮。

前端测试：

- 课程列表渲染。
- 课程详情与章节树。
- 字幕搜索结果。
- 导出任务状态。
- 授权与 API 状态展示。

端到端验证：

- 使用模拟学习页面验证插件采集流程。
- 使用真实文才学校页面进行手动验证，仅确认识别、记录、提醒、高亮，不执行自动刷课动作。

## 第一版交付范围

第一版交付：

- Monorepo 项目结构。
- FastAPI 服务骨架。
- PostgreSQL schema 和 Alembic 迁移。
- React 控制台骨架。
- Chrome 插件 Manifest V3 骨架。
- adapter 框架。
- `generic-video`、`generic-dom-course`、`wencai-school` 三个 adapter。
- 课程、章节、字幕、笔记、播放事件的 API 和页面。
- Markdown/JSON 导出。
- Windows 启动脚本。
- README 安装与使用说明。

暂不交付：

- 在线支付。
- 云端 license 校验。
- 适配器市场。
- Excel 导出。
- 团队协作批注。
- 自动化平台学习操作。

## 风险与缓解

- 不同学习平台 DOM 差异大：通过 adapter 机制隔离平台差异。
- 平台页面更新导致识别失败：adapter 提供调试面板和选择器回退。
- 字幕可能不是 DOM 文本：第一版记录 DOM 可见文本和浏览器可读取字幕，OCR/语音识别留到后续版本。
- PostgreSQL 部署门槛高：提供 `.env.example` 和 Windows 脚本，后续可补 Docker Compose。
- 合规风险：在产品层、代码层和测试层明确禁止自动提交学习记录、自动刷课、绕过播放。

## 成功标准

- 插件能在通用视频页面识别视频并记录播放事件。
- 插件能在文才学校学习页面识别课程、章节、当前视频和可见字幕/文本。
- Python 服务能稳定接收并保存课程、章节、字幕、笔记和播放事件。
- 控制台能查看课程详情、搜索字幕、导出 Markdown/JSON。
- 所有自动化行为都停留在记录、提醒、高亮和导出，不影响平台学习成绩。

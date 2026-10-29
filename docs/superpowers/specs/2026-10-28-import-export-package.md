# 导入 / 导出包（.lapkg）设计

- 日期：2026-10-28
- 状态：**全部实现**（P0–P3 + Anki TSV / CSV 适配器 + 导出异步化）；`.apkg` 二进制明确不做
- 关联：`apps/api/app/routes/exports.py`、`apps/api/app/routes/imports.py`、
  `apps/api/app/services/export_payload.py`、`apps/api/app/services/import_source.py`、
  `apps/api/app/services/importer.py`、`apps/api/app/exporters/package.py`、
  `apps/console/src/pages/DataTransfer.tsx`、`apps/console/src/pages/CourseDetail.tsx`
- 落地记录：P0「附录 A」、P1「附录 B」、P2「附录 C」、P3「附录 D」、适配器「附录 E」、导出异步化「附录 F」、任务恢复与清理入口「附录 G」

## 1. 背景与目标

现有导出只能从课程详情页触发、同步生成、只覆盖「标题 + 章节 + 字幕 + 笔记」四类数据，
截图、复习卡、测验题、摘要、学习会话都不在里面，也没有格式版本号，因此**不能用于迁移或备份**。

本次要补齐的是**同平台、跨设备的搬迁**：

> 设备 A 上采集的课程（字幕/笔记/截图/AI 摘要/复习卡/测验），打包带走，
> 在设备 B 上导入后继续用，且**不破坏 B 上已有的数据**。

## 2. 决策记录（已确认）

| # | 问题 | 决定 |
|---|---|---|
| 1 | 主要场景 | 同平台不同设备之间的搬迁（自有包往返） |
| 2 | 冲突默认策略 | `merge`（补缺失、不覆盖本地改动） |
| 3 | 媒体 | **全部媒体**：截图 + 笔记图片都打包 |
| 4 | 导入权限 | 组织内所有成员均可导入 |
| 5 | Anki 反向导入 | 本期只预留扩展点，不做实现 |

## 3. 范围与非目标

**做**

- 完整课程包导出（zip），含媒体，带 manifest 与校验和
- 包导入（dry-run 预览 + 正式执行 + 结果报告）
- 导出中心页（多课程 / 全部课程 / 历史 / 下载 / 删除）
- 顺带修复：导出列表与下载缺少组织过滤

**不做（本期）**

- Anki / CSV / 第三方平台适配器（仅留 `source_type` 扩展点）
- 跨实例增量同步、冲突的人工逐条合并 UI
- 导入回滚到任意历史点（只支持「撤销本次导入新建的对象」）

## 4. 包格式 v1

扩展名 `.lapkg`，本质是 zip（不加密）。内容：

```
manifest.json
courses/<course_id>/course.json
courses/<course_id>/chapters/<chapter_id>.json
courses/<course_id>/cards.json
courses/<course_id>/quiz.json
media/screenshots/<screenshot_id>.<ext>
media/note-images/<note_image_id>.<ext>
```

- `<course_id>` / `<chapter_id>` / 媒体 id 均使用**导出时数据库里的 uuid**，
  导入端据此建立 id 映射（见第 7 节）。
- 一个包可包含多门课程（支持「全部课程」导出）。
- 媒体文件名为 `<uuid>.<ext>`，扩展名以库里实际文件为准。
- `manifest.json` **最后写入**：包缺 manifest 就说明没写完，导入端可直接判为损坏包。

### 4.1 manifest.json

```json
{
  "schema_version": 1,
  "app_version": "0.1.0",
  "exported_at": "2026-10-28T09:00:00+00:00",
  "organization": { "id": "…", "name": "Local Workspace" },
  "scope": { "type": "courses", "course_count": 2 },
  "counts": {
    "courses": 2, "chapters": 41, "transcripts": 3120,
    "notes": 288, "screenshots": 96, "note_images": 12,
    "cards": 140, "quiz_questions": 60
  },
  "media": { "included": true, "bytes": 183452211 },
  "checksums": {
    "courses/…/course.json": "sha256:…",
    "media/screenshots/….png": "sha256:…"
  }
}
```

规则：

- `schema_version` 是**整数**；导入端只接受 `<=` 自身支持的最大版本，
  更高版本直接拒绝并提示「请升级服务端」。
- `counts` 用于 dry-run 的规模预估与执行后的完整性校验（实际入库数必须相等，否则报错）。
- `checksums` 可选但默认输出；导入时逐条校验，失败即中止（防拷贝损坏）。

### 4.2 course.json

```json
{
  "id": "…",
  "site": { "adapter_id": "wencai-school", "name": "文才学堂", "host_patterns": {...} },
  "external_course_id": "course-123",
  "title": "数据结构",
  "term": "2026 秋",
  "metadata": { "...": "原 courses.metadata" },
  "archived": false,
  "chapters": [
    { "id": "…", "parent_id": null, "external_chapter_id": "ch-1",
      "title": "绪论", "sort_order": 1, "duration_seconds": 1830,
      "metadata": {...} }
  ],
  "summary": { "summary_md": "…", "outline": [...], "key_points": [...], "model": "kimi-k3" }
}
```

### 4.3 chapters/<chapter_id>.json

```json
{
  "id": "…",
  "external_chapter_id": "ch-1",
  "title": "绪论",
  "video": { "page_url": "…", "media_url": "…", "media_type": "file", "is_likely_signed": true },
  "transcripts": [
    { "id": "…", "start_seconds": 0.0, "end_seconds": 3.2, "text": "…", "source": "page" }
  ],
  "notes": [
    { "id": "…", "user_id": "…", "video_time_seconds": 12.5,
      "content": "…", "corrected_content": null, "tags": ["考点"],
      "created_at": "2026-10-01T10:00:00+00:00" }
  ],
  "screenshots": [
    { "id": "…", "user_id": "…", "video_time_seconds": 30.0,
      "ocr_text": "…", "file": "media/screenshots/<id>.png" }
  ],
  "note_images": [
    { "id": "…", "user_id": "…", "file": "media/note-images/<id>.png" }
  ],
  "chapter_summary": { "summary_md": "…", "outline": [...], "key_points": [...], "model": "…", "status": "done" },
  "memo": { "content_md": "…" }
}
```

> `note_images` 只有 `id / user_id / file_path`，与 note 无外键关联——
> 笔记正文用 `![alt](note-image:<id>)` 这种自定义 Markdown 引用图片，
> 前端渲染成 `<img data-note-image-id="<id>">` 后再按 id 拉取 `/api/v1/notes/images/<id>/image`。
> 因此**必须保留图片 id**（见 7.2），否则历史笔记里的图片会全部变成裂图。

## 5. 字段映射

| 表 | 包内位置 | 说明 |
|---|---|---|
| `courses` | `course.json` | 除 `organization_id / site_id / created_at` 全带走；`metadata` 原样 |
| `sites` | `course.json.site` | 用 `adapter_id` 作为匹配键（库内唯一） |
| `chapters` | `course.json.chapters` | 保留 `parent_id / sort_order / duration_seconds / metadata` |
| `transcript_segments` | `chapters/*.json.transcripts` | 不含 `video_session_id`（会话数据不迁移） |
| `notes` | `chapters/*.json.notes` | 保留 `created_at`（学习轨迹需要） |
| `screenshots` | `chapters/*.json.screenshots` + `media/` | `file_path` 重写为包内路径 |
| `note_images` | `chapters/*.json.note_images` + `media/` | 同上 |
| `chapter_summaries` | `chapters/*.json.chapter_summary` | 1:1，按 `chapter_id` 唯一 |
| `chapter_memos` | `chapters/*.json.memo` | 1:1 |
| `course_summaries` | `course.json.summary` | 1:1 |
| `review_cards` | `cards.json` | 保留 `ease_factor / interval_days / due_at / review_count / suspended`；`review_logs` 不迁移 |
| `quiz_questions` | `quiz.json` | 保留题型、选项、答案、解析 |
| `video_sessions` / `timeline_events` | **不导出** | 属于设备级学习时长，迁移会污染统计（见 12 节风险） |

`user_id`：包内保留原值用于溯源；导入时**一律改写为执行导入的用户**（跨设备时原用户可能不存在）。

## 6. 合并规则（merge 的精确定义）

按对象类型分级，**只增不覆盖**：

| 对象 | 匹配键 | 已存在时 |
|---|---|---|
| site | `adapter_id` | 复用，不更新名称/域名 |
| course | `(organization_id, site_id, external_course_id)`（已有唯一约束） | 复用；`title/term/metadata` 仅在本地为空时补 |
| chapter | `(course_id, external_chapter_id)` | 复用；同上 |
| transcript | `sha256(chapter_id + start_seconds + text)` | 跳过 |
| note | `sha256(chapter_id + content + video_time_seconds)` | 跳过 |
| screenshot | `sha256(chapter_id + file_bytes)` | 跳过 |
| note_image | 主键 id | 跳过 |
| chapter_summary / memo / course_summary | 1:1 键 | **仅当本地不存在**才写入 |
| review_card | `sha256(course_id + front)` | 跳过；`due_at` 取较早者 |
| quiz_question | `sha256(chapter_id + question)` | 跳过 |

其他策略（通过参数选择，默认 `merge`）：

- `skip`：包内对象凡是自然键已存在就整条跳过（比 merge 更保守，不补字段）
- `replace`：同章/同课程的对应集合整体替换（需 `?confirm=replace` 二次确认）
- `new`：强制新建副本，`external_*_id` 追加 `-import-<8位>` 后缀

## 7. ID 与引用重写

### 7.1 全局映射表

导入过程维护 `old_id -> new_id`：

- 默认**沿用包内 id**（同平台迁移时冲突概率可忽略，且能省掉大量引用重写）
- 若该 id 已被不同自然键占用 → 生成新 id，并写入映射
- 所有外键引用（`parent_id`、`chapter_id`、`note_id`、`card.chapter_id` 等）在落库前按映射重写

### 7.2 媒体 id 必须保留

笔记正文里的 `![alt](note-image:<id>)` 依赖 id 稳定，因此
`note_images` 的 id **优先沿用**；确实冲突时改 id，并同步重写引用它的 Markdown
（把 `note.content` 与 `corrected_content` 里的 `note-image:<旧id>` 换成新 id）。

`screenshots` 没有这种硬引用——`file_path` 是库内字段，导入时直接重写成新落盘路径即可。

### 7.3 媒体落盘

- 解压后落到 `SCREENSHOTS_DIR` / `NOTE_IMAGES_DIR`，文件名统一为 `<id>.<ext>`
- `file_path` 写入**本机绝对路径**（与现有实现一致），不使用包内相对路径
- 已存在同名同内容文件 → 跳过写盘；同名不同内容 → 以导入内容为准并记录告警

## 8. 导入流程

```
上传 → 校验 → 解析(dry-run) → 预览确认 → 落库 → 报告
```

状态机（`import_jobs.status`）：

```
queued → validating → parsing → applying → done
                 ↘ failed        ↘ failed
              canceled
```

阶段约束：

- **校验**：zip 结构、`schema_version`、大小限额、扩展名白名单、路径穿越、checksums
- **解析**：只读包 + 只查库，产出 `ImportPlan`（新增/跳过/冲突明细），不写库
- **落库**：按课程分批事务，每 500 条对象 flush 一次；记录本批新建 id 集合
- **失败**：整批课程事务回滚；`import_jobs.error` 记录首个错误与上下文；已提交的课程保留
- **报告**：`stats` 与 `created_ids` 落库，前端可下载 JSON 报告

## 9. API 契约

```
POST /api/v1/imports                  multipart(file) + strategy + dry_run
                                      → 202 { job_id, status }
GET  /api/v1/imports                  → { items: [...] }   按 organization 过滤
GET  /api/v1/imports/{id}             → { status, progress, stats, error, created_at }
POST /api/v1/imports/{id}/cancel      → 204                 仅 queued/parsing 可取消
GET  /api/v1/imports/{id}/report      → 下载 JSON 报告
```

导出侧同步扩展（复用现有 `exports` 表）：

```
POST /api/v1/exports   { course_ids?: string[], export_format: "package"|
                         "markdown"|"json"|"anki"|"report_pdf", include_media?: bool }
GET  /api/v1/exports/{id}           新增：单个任务进度查询
```

`export_format` 新增 `package`（.lapkg）。`course_ids` 为空表示全部课程。

## 10. 数据库变更

**P0 已落地（迁移 0022_export_package_columns）**：只给 `exports` 补了 4 列。

```sql
ALTER TABLE exports ADD COLUMN progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exports ADD COLUMN error TEXT;
ALTER TABLE exports ADD COLUMN size_bytes INTEGER;
ALTER TABLE exports ADD COLUMN scope_counts JSON DEFAULT '{}';
```

**P1 已落地（迁移 0023_import_jobs）**：`import_jobs` 表。

```sql
CREATE TABLE import_jobs (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  source_filename VARCHAR(255) NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum VARCHAR(80),
  strategy VARCHAR(20) NOT NULL DEFAULT 'merge',
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(40) NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  stats JSON DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX ix_import_jobs_org_created ON import_jobs(organization_id, created_at);
```

## 11. 导出改造清单

1. 抽出 `app/exporters/package.py` 与统一的 `build_course_package(db, org, courses)`，
   JSON / 包 / Markdown / PDF 共用同一份 payload，杜绝字段各取一套
2. 全部导出走 job（`queued → running → completed/failed` + `progress`），前端订阅进度
3. 导出中心页：多选课程、含媒体开关、历史列表、进度、下载、删除
4. `list_exports` / `download_export` 补 `organization_id` 过滤
5. Markdown 增加元信息头（来源、导出时间、schema 版本）、目录、截图相对路径
6. Anki 增加 tags 列；「无复习卡时退回用笔记」改为显式开关
7. 过期清理：保留最近 N 份或 N 天，挂到 `digest_scheduler` 同类定时任务

## 12. 安全与风险

**护栏**

- 包 ≤ 200MB、单条目 ≤ 50MB、条目数 ≤ 5000、解压总量 ≤ 1GB
- 拒绝绝对路径、`..`、符号链接；落盘名一律按 id 重写
- 扩展名白名单：json / png / jpg / jpeg / webp / gif
- 包内 `organization_id` 一律忽略，只写当前组织
- 全流程写 `audit_logs`（`import.create` / `export.create`）

**已知风险**

| 风险 | 说明 | 缓解 |
|---|---|---|
| 学习时长统计错乱 | `video_sessions` 不迁移，导入课程在设备 B 上显示「未学过」 | 文档说明 + 导入报告提示 |
| 媒体体积大 | 一百张截图 ≈ 50–150MB | 允许「不含媒体」导出；导入时按需 |
| 大包解析耗时 | 3 万条字幕解析几十秒 | dry-run 与执行均异步 + 进度 |
| id 冲突 | 极端情况下 uuid 被占用 | 映射表 + 引用重写 + 告警 |
| 重复导入 | 用户反复点 | 幂等指纹 + 同一 checksum 的包 24h 内提示「已导入过」 |

## 13. 分阶段与验收

| 阶段 | 交付 | 验收标准 |
|---|---|---|
| **P0** | 包格式 v1 + `package` 导出 + 单/多课程 zip | 导出包能被脚本按 manifest 完整读回；counts 与 checksums 全部匹配 |
| **P1** | 导入后端（job / 校验 / dry-run / merge 落库）+ 媒体落盘 | 两台设备往返：A 导出 → B 导入 → 课程/字幕/笔记/截图/摘要/卡片数量一致，图片不裂 |
| **P2** | 导入向导 UI + 结果报告 + 导出中心页 | 全流程无命令行；重复导入同一包，第二次新增数为 0 |
| **P3** | 清理策略、审计看板、`replace`/`new` 策略 | — |
| 预留 | `source_type` 字段 + `ImportSource` 协议，供 Anki/CSV 适配器接入 | 新增适配器不改动导入主流程 |

## 14. 扩展点（为第 5 条决策预留）

导入入口统一为：

```python
class ImportSource(Protocol):
    def parse(self, blob: bytes) -> ImportPlan: ...   # 只解析，不碰库
```

`.lapkg` 只是其中一个实现（`LapkgSource`）。后续 Anki（`.apkg`/TSV）、CSV 笔记、
其他平台导出都注册成 `ImportSource`，复用第 8 节的状态机、第 6 节的合并规则、
第 9 节的 API 与前端向导，只需新增解析器与字段映射。

## 附录 A：P0 落地记录（2026-10-28）

### 新增

| 文件 | 作用 |
|---|---|
| `apps/api/app/services/export_payload.py` | DB → 导出文档的统一组装层（`build_export_bundle`），JSON / Markdown / PDF / 包共用 |
| `apps/api/app/exporters/package.py` | 文档 → `.lapkg`（zip），写 manifest 与逐文件 sha256 |
| `apps/api/alembic/versions/0022_export_package_columns.py` | `exports` 增补 progress / error / size_bytes / scope_counts |

### 改动

| 文件 | 改动 |
|---|---|
| `apps/api/app/routes/exports.py` | 新格式 `package`；支持 `course_ids` / `include_media`；list、get、download 全部按组织隔离；新增 `GET /exports/{id}` |
| `apps/api/app/models/entities.py` | `Export` 增补 4 列 |
| `apps/api/app/schemas/workspace.py` | `ExportCreateIn` / `ExportItem` 增补字段 |
| `apps/console/src/api/client.ts` | `ExportFormat` 增加 `package`；payload 支持 `course_ids` / `include_media` |
| `apps/console/src/pages/CourseDetail.tsx` | 导出菜单增加「完整包（.lapkg）」、媒体开关；导出记录显示文件名、体积与中文状态 |
| `apps/api/tests/test_exports.py` | 新增 7 个用例：manifest、checksums、媒体、多课程、只读接口、版本一致性 |

### 验收结果

- `tests/test_exports.py`：18 passed；连同 `test_study_report.py` 共 22 passed
- 真实库往返：11 门课程 / 172 章节 / 49 张截图 → 6.69 MB 包；
  manifest `counts` 与「读包反算」完全一致；233 条 checksum 全部通过；缺盘媒体 0
- 后端全量回归：222 passed

### 与规范的偏差（已确认可接受）

- `markdown` / `json` 保持原有精简结构（不含媒体），完整模型只进包；P1 再统一
- `manifest.json` 最后写入（包缺 manifest 即视为损坏），规范原文未限定顺序
- 章节 JSON 多一个 `video` 字段，供 Markdown/JSON 导出沿用
- 「未指定课程」对 `report_pdf` 仍是全部课程汇总档案，对 `package` 是全部课程

## 附录 B：P1 落地记录（2026-10-28）

### 新增

| 文件 | 作用 |
|---|---|
| `apps/api/app/services/import_source.py` | `ImportSource` 协议 + `LapkgSource`：读包、限额、路径安全、逐文件 checksum、解析成 `ImportPlan`（不碰库） |
| `apps/api/app/services/importer.py` | `run_import`：merge 落库 + 媒体流式落盘；`dry_run=True` 全程只读 |
| `apps/api/app/routes/imports.py` | 上传 / 列表 / 详情 / 取消 / 报告，后台任务 `run_import_job` |
| `apps/api/alembic/versions/0023_import_jobs.py` | `import_jobs` 表 |
| `apps/api/tests/test_imports.py` | 17 个用例 |

### 实现要点

- **校验顺序**：体积 → zip 结构 → 条目名（绝对路径 / `..` / 符号链接）→ 条目数与总解压量 → 扩展名白名单 → manifest 与 schema_version → 逐文件 checksum
- **merge 去重键**：课程 / 章节走既有唯一约束；字幕 `(start_seconds, text)`；笔记 `(content, video_time_seconds)`；截图与笔记图片按 id；复习卡按 `front`；题目按 `(chapter_id, question)`
- **id 策略**：包内 id 未被占用就沿用；`note_images` 必须沿用，否则笔记 Markdown 里的 `note-image:<id>` 会裂图；冲突时换新 id 并重写引用
- **媒体**：按需从 zip 流式写出到 `SCREENSHOTS_DIR` / `NOTE_IMAGES_DIR`；目标已存在且 sha256 相同则跳过，不同则覆盖并在 `conflicts` 里留痕；包里缺媒体的截图不建记录（避免出现打不开的图）
- **事务**：每门课程一个事务，一门失败不影响其它课程
- **dry-run**：与正式导入共用同一份 `ImportPlan`，只是不写库，返回「将会新增多少」
- **后台任务**：沿用 `ai_tasks` 的模式（`run_import_job(job_id, data, session_factory=None)`），测试可替换 session 工厂

### 验收

- `tests/test_imports.py`：**17 passed**，覆盖导出 → 清空 → 导入的完整往返（课程 / 章节 / 字幕 / 笔记 / 截图 / 卡片 / 媒体文件）、重复导入幂等、dry-run 只读、6 类校验拒绝、取消冲突、报告下载、未知任务 404
- 真实库：11 门课程 / 172 章节 / 67 张截图 → 8.63 MB 包；
  dry-run 与正式 merge 均为 **0 新增、11 课程匹配、172 章节匹配、67 截图跳过、0 冲突、0 媒体覆盖**
- 后端全量回归：见提交时的测试结果

### 未做（按计划留给 P2 / P3）

- 前端导入向导、进度条、结果报告页
- `replace` / `new` 策略（接口当前返回 400）
- Anki / CSV 适配器（`ImportSource` 扩展点已就绪）

## 附录 C：P2 落地记录（2026-10-28）

### 新增

| 文件 | 作用 |
|---|---|
| `apps/console/src/pages/DataTransfer.tsx` | 「导入导出」页：导出中心 + 导入向导 |
| `apps/console/src/pages/DataTransfer.test.tsx` | 页面结构用例 |
| `DELETE /api/v1/exports/{id}` | 删除导出记录与其文件（导出中心的「删除」） |

### 改动

| 文件 | 改动 |
|---|---|
| `apps/console/src/navSlug.ts` | 导航新增「导入导出」（`#/transfer`） |
| `apps/console/src/components/icons.tsx` | 新增该页面的导航图标 |
| `apps/console/src/App.tsx` | 路由到 `DataTransfer` 并传入 session token |
| `apps/console/src/api/client.ts` | `startImport`（multipart，5 分钟超时）/ `fetchImports` / `fetchImport` / `cancelImport` / `fetchImportReport` / `deleteExport` |
| `apps/console/src/styles.css` | 课程选择胶囊、导入进度条、统计网格、冲突列表等样式 |
| `apps/api/app/routes/exports.py` | 新增删除接口（按组织过滤；顺带删文件） |

### 交互设计

- **导出**：课程多选（全选/清空）→ 选格式（完整包 / Markdown / JSON / Anki / PDF）→
  完整包可关掉媒体 → 创建后自动下载；下表是历史记录（格式、内容规模、状态、体积、时间、下载、删除）
- 单选格式（Markdown/JSON/Anki/PDF）选了多门课程时自动只用第一门并给出提示
- **导入**：选择 .lapkg → 「预览（不写入）」跑 dry-run，展示 8 项统计与冲突列表 →
  「确认导入（merge）」复用同一个文件正式落库；运行中可取消；完成可下载 JSON 报告
- 导入记录表展示文件名、状态（预览会标「（预览）」）、进度、体积、时间

### 验收

- 前端：`tsc` 通过，**176 passed**（新增 5 个：页面 2 个 + client 3 个）
- 后端：`tests/test_exports.py` 19 passed（含新增的删除用例）、`tests/test_imports.py` 17 passed
- 真实渲染（无头 Edge + 临时 API/控制台实例）：导航出现「导入导出」，页面加载 11 门课程、
  2 条真实导出记录、导入区空态正常；截图见提交说明

## 附录 D：P3 落地记录（2026-10-29）

### 导出记录清理

| 文件 | 作用 |
|---|---|
| `apps/api/app/services/export_cleanup.py` | `cleanup_exports`（按份数 / 天数删除记录与文件）+ 每小时定时线程 |
| `app/core/config.py` | `EXPORT_RETENTION_DAYS` / `EXPORT_RETENTION_COUNT` / `EXPORT_CLEANUP_ENABLED` / `EXPORT_CLEANUP_INTERVAL_SECONDS` |
| `POST /api/v1/exports/cleanup` | 手动触发（owner，按组织范围；可显式传 `keep_days` / `keep_count`） |

- 两条规则可单用也可叠加，叠加时取「删得更狠」的那批
- 删除记录的同时删磁盘文件（只删记录会留下孤儿文件）
- 定时线程沿用 `digest_scheduler` 的写法，随 app lifespan 启动

### 导入策略 replace / new

- `run_import(strategy=...)`：`merge`（默认）/ `new` / `replace`，策略写进 `import_jobs.strategy` 与统计
- **new**：不做课程匹配，直接新建副本，`external_course_id` 追加 `-import-<8 位>` 规避唯一约束
- **replace**：复用同名课程与章节，但章节内容（字幕 / 笔记 / 截图 / 章节摘要 / 备忘）先清空再按包写入；
  课程级卡片、题目、无章节笔记与截图整体替换；删截图行前先删磁盘文件
- 控制台：导入区新增「导入策略」下拉（含逐项说明），选「覆盖」时按钮变「确认覆盖导入」，
  **需要连点两次**才执行；导入记录里标注非默认策略

### 验收

- 后端：`tests/test_exports.py` 21 passed（新增 2 个清理用例）、`tests/test_imports.py` 19 passed
  （新增 new 副本、replace 覆盖、非法策略用例），全量 244 passed
- 前端：`tsc` 通过，177 passed（新增策略选项用例）
- 真实库：`POST /exports/cleanup` 以 `keep_count=当前条数` 跑过一次，确认 0 删除、统计正确（不做破坏性验证）

### 仍未做

- Anki（`.apkg` / TSV）与 CSV 笔记适配器：`ImportSource` 协议与导入主流程已就绪，接入只需新增解析器

## 附录 E：Anki / CSV 适配器（2026-10-29）

### 新增（均在 `apps/api/app/services/import_source.py`）

| 类 / 函数 | 输入 | 产出 |
|---|---|---|
| `AnkiTsvSource` | Anki 纯文本导出（`.tsv` / `.txt`） | 复习卡（front / back，可选第 3 列 tags） |
| `CsvSource` | `.csv` | 卡片（front/back）或笔记（content + 可选 tags / time） |
| `source_for_filename()` | 文件名 | 按扩展名选适配器；不支持的类型直接 400 |

### 设计取舍

- 两类文本都没有课程结构，统一落到**按来源命名的合成课程**（`anki-import` / `csv-import`）：
  重复导入会命中同一门课程并走 merge 去重，不会堆出一堆同名课程；用户后续可以在课程页改名
- Anki 指令都识别：`#separator:tab|comma|semicolon`、`#tags column:N`、`#html:true`；
  `<br>` 转换行，其余标签剥掉并还原常见实体
- CSV 支持中英文表头（front/back、正面/背面、content/正文/笔记 等），`time` 支持 `90` 与 `01:30`；
  无表头时单列按笔记、多列按「正面,背面」
- `.apkg` 二进制**明确不做**：要解 sqlite collection、note type 与媒体映射，成本远高于收益

### 顺带修掉的两个隐患

1. `_MediaWriter` 在无媒体时仍会尝试打开 zip —— 文本来源没有 zip，原实现会抛 `BadZipFile`
2. 课程级（`chapter_id` 为 NULL）的笔记与截图此前只计数不落库，CSV 笔记会悄悄丢失；
   已改为正常写入，并按「课程级」范围去重

### 验收

- `tests/test_imports.py` 28 passed（新增 9 个：TSV/CSV 解析、中英文表头、时间解析、
  扩展名映射、合成课程落库、重复导入幂等、课程级笔记落库、不支持类型 400）
- 全量后端 253 passed；前端 178 passed，`tsc` 通过
- 真实库：TSV → 2 张卡片、CSV → 2 条笔记（标签与时间点正确），验证后测试数据已清理

## 附录 F：导出异步化与审计（2026-10-29）

此前 `POST /exports` 在请求内直接生成文件：几百 MB 的包会因为前端 30s 默认超时被掐断，
`exports.progress` 也只在完成时置 100 —— 规范 §11 第 2 条要求「导出也走 job + 真实进度」，
这次补齐。

### 改动

| 文件 | 改动 |
|---|---|
| `app/routes/exports.py` | `POST /exports` 只落 `queued` 记录后立即返回，生成交给 `run_export_job`（`BackgroundTasks`）；抽出 `_generate_export_file` 供前后台共用；失败时写 `failed` + `error` + 审计 |
| `app/exporters/package.py` | `write_package` 增加 `on_progress(0-100)`，按「课程 + 媒体文件」逐步上报 |
| `app/services/audit.py` | 新增 `EXPORT_CREATED` / `EXPORT_FAILED`，补上规范 §12 要求的导出审计 |
| `app/tests/conftest.py` | 新增 autouse fixture，把 `exports` / `imports` 的后台任务 `SessionLocal` 指向测试库（此前导出任务会写真实库） |
| 控制台 | 导出创建后轮询到完成/失败并显示百分比；记录表在 `queued/running` 时显示进度；`STATUS_LABELS` 增加「处理中」 |

进度分段：置 5% → 生成过程映射到 10–95% → 完成 100%；失败时归 0 并记录错误。

### 验收

- `tests/test_exports.py` 22 passed（新增失败路径用例：生成抛错 → 记录变 `failed`、
  `error` 带原始信息、`progress` 归 0、`file_path` 为空）
- 全量后端 259 passed；前端 178 passed，`tsc` 通过
- 真实库：11 门课程 / 67 张截图导出仍能生成完整包（异步流程与同步结果一致）

### 顺带修掉

- 后台任务默认使用真实 `SessionLocal`，测试里若不替换会写进真实数据库 —— 现在 conftest
  统一替换，避免以后写测试时踩坑

## 附录 G：中断任务回收与清理入口（2026-10-29）

### 中断任务回收

导入/导出都跑在进程内的 `BackgroundTasks` 里。API 重启或崩溃时，正在跑的任务会永远停在
`applying` / `running`：前端轮询到超时也拿不到结论，历史里留一条永不结束的记录。

- 新增 `app/services/job_recovery.py`：`recover_stale_jobs()` 把仍处于进行中的
  导入（`queued/validating/parsing/applying`）与导出（`queued/running`）标记为 `failed`，
  写入「服务重启导致中断，请重新…」并归零进度
- 在 `lifespan` 启动时调用，异常只记日志、不阻断启动
- `JOB_RECOVERY_GRACE_SECONDS`（默认 0）用于多 worker 部署：调大后只回收超过该时长的任务，
  避免后启动的 worker 误判别的 worker 正在跑的任务
- 单进程部署（`scripts/dev.ps1`）用默认 0 即可

### 清理入口

导出清理此前只有 `POST /api/v1/exports/cleanup`，必须改 `.env` 或用 curl。现在控制台
「导入导出 → 导出」面板底部增加「保留最近 N 份 → 清理更早的导出」，直接调用同一接口；
`403` 会提示「只有管理员可以清理导出记录」。

### 验收

- `tests/test_job_recovery.py` 4 passed：进行中的导入/导出被判失败、已完成的不会被误伤、
  宽限期生效、重复执行幂等
- 全量后端 258 passed；前端 179 passed，`tsc` 通过
- 真实库：插入 1 条卡住的导入 + 1 条卡住的导出 + 1 条已完成导出 → 启动 API 后前两条变
  `failed`（原因含「服务重启」、进度 0），已完成那条仍为 `completed`；验证后已清理测试数据

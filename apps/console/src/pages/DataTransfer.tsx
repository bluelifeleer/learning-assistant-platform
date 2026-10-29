import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelImport,
  createExport,
  deleteExport,
  downloadExport,
  fetchCourses,
  fetchExports,
  fetchImport,
  fetchImportReport,
  fetchImports,
  startImport,
  type CourseItem,
  type ExportFormat,
  type ExportItem,
  type ImportJobItem,
} from "../api/client";

const EXPORT_FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "package", label: "完整包（.lapkg）", hint: "章节、字幕、笔记、截图、复习卡、测验题与 AI 摘要，可带到另一台设备导入" },
  { value: "markdown", label: "Markdown", hint: "单门课程的 Markdown 文本（不含图片）" },
  { value: "json", label: "JSON", hint: "单门课程的 JSON 文本（不含图片）" },
  { value: "anki", label: "Anki 卡片", hint: "单门课程的复习卡 TSV，可直接导入 Anki" },
  { value: "report_pdf", label: "学习档案 PDF", hint: "按课程汇总学习时长、笔记、截图与测验正确率" },
];

const SINGLE_COURSE_FORMATS: ExportFormat[] = ["markdown", "json", "anki", "report_pdf"];

type ImportStrategy = "merge" | "new" | "replace";

const IMPORT_STRATEGIES: { value: ImportStrategy; label: string; hint: string }[] = [
  { value: "merge", label: "合并（推荐）", hint: "只补缺失内容：已有对象按自然键匹配后跳过，不覆盖本地改动。" },
  { value: "new", label: "新建副本", hint: "不匹配已有课程，直接新建一份带后缀的副本，本地数据完全不动。" },
  {
    value: "replace",
    label: "覆盖",
    hint: "复用同名课程与章节，但章节内的字幕、笔记、截图、摘要会先清空再按包写入。",
  },
];

const STRATEGY_LABELS: Record<string, string> = {
  merge: "合并",
  new: "新建副本",
  replace: "覆盖",
};

const SOURCE_LABELS: Record<string, string> = {
  lapkg: "完整包",
  anki_tsv: "Anki TSV",
  csv: "CSV",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "排队中",
  validating: "校验中",
  parsing: "解析中",
  applying: "导入中",
  done: "已完成",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消",
};

const STAT_LABELS: { key: string; label: string }[] = [
  { key: "courses_created", label: "新增课程" },
  { key: "chapters_created", label: "新增章节" },
  { key: "transcripts_added", label: "新增字幕" },
  { key: "notes_added", label: "新增笔记" },
  { key: "screenshots_added", label: "新增截图" },
  { key: "cards_added", label: "新增复习卡" },
  { key: "quiz_added", label: "新增题目" },
  { key: "media_written", label: "写入媒体" },
];

function formatBytes(size?: number | null): string {
  if (!size) return "-";
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function formatTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function waitForImport(
  jobId: string,
  token: string | undefined,
  onUpdate: (job: ImportJobItem) => void,
): Promise<ImportJobItem> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const job = await fetchImport(jobId, token);
    onUpdate(job);
    if (["done", "failed", "canceled"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("导入仍在进行，可稍后在导入记录里查看结果");
}

export function DataTransfer({ token }: { token?: string }) {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [coursesError, setCoursesError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("package");
  const [includeMedia, setIncludeMedia] = useState(true);
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [exportsBusy, setExportsBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importJob, setImportJob] = useState<ImportJobItem | null>(null);
  const [importStrategy, setImportStrategy] = useState<ImportStrategy>("merge");
  const [replaceArmed, setReplaceArmed] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportJobItem[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reloadExports = useCallback(() => {
    void fetchExports(token)
      .then((result) => setExports(result.items))
      .catch((error: unknown) => setExportMessage(error instanceof Error ? error.message : "导出记录读取失败"));
  }, [token]);

  const reloadImports = useCallback(() => {
    void fetchImports(token)
      .then((result) => setImportHistory(result.items))
      .catch((error: unknown) => setImportMessage(error instanceof Error ? error.message : "导入记录读取失败"));
  }, [token]);

  useEffect(() => {
    void fetchCourses(token, true)
      .then((result) => setCourses(result.items))
      .catch((error: unknown) => setCoursesError(error instanceof Error ? error.message : "课程列表读取失败"));
    reloadExports();
    reloadImports();
  }, [token, reloadExports, reloadImports]);

  const needsSingleCourse = SINGLE_COURSE_FORMATS.includes(exportFormat);
  const effectiveSelection = needsSingleCourse && selectedIds.length > 1 ? selectedIds.slice(0, 1) : selectedIds;
  const selectedFormat = EXPORT_FORMATS.find((item) => item.value === exportFormat);

  function toggleCourse(id: string): void {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submitExport(): Promise<void> {
    setExportsBusy(true);
    setExportMessage("");
    try {
      const payload = {
        export_format: exportFormat,
        ...(exportFormat === "package"
          ? { include_media: includeMedia, ...(effectiveSelection.length ? { course_ids: effectiveSelection } : {}) }
          : {}),
        ...(needsSingleCourse && effectiveSelection.length ? { course_id: effectiveSelection[0] } : {}),
      };
      const created = await createExport(payload, token);
      const listing = await fetchExports(token);
      const item = listing.items.find((row) => row.id === created.id);
      if (item?.status === "completed") {
        const blob = await downloadExport(item.id, token);
        downloadBlob(blob, item.file_path?.split(/[\\/]/).pop() || `${item.id}.lapkg`);
        setExportMessage(`导出完成：${formatBytes(item.size_bytes)}`);
      } else if (item?.status === "failed") {
        setExportMessage(`导出失败：${item.error || "未知原因"}`);
      } else {
        setExportMessage("导出已创建，可在下方记录中下载");
      }
      reloadExports();
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExportsBusy(false);
    }
  }

  async function removeExport(item: ExportItem): Promise<void> {
    setExportsBusy(true);
    try {
      await deleteExport(item.id, token);
      reloadExports();
      setExportMessage("已删除导出记录与文件");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setExportsBusy(false);
    }
  }

  async function runImport(dryRun: boolean): Promise<void> {
    if (!importFile) {
      setImportMessage("请先选择 .lapkg 导出包");
      return;
    }
    setImportBusy(true);
    setImportMessage(dryRun ? "正在解析并预估…" : "正在导入…");
    try {
      const started = await startImport(importFile, { dryRun, strategy: importStrategy }, token);
      const job = await waitForImport(started.job_id, token, (next) => {
        if (mountedRef.current) setImportJob(next);
      });
      if (job.status === "failed") {
        setImportMessage(`导入失败：${job.error || "未知原因"}`);
      } else if (dryRun) {
        setImportMessage("预览完成，确认无误后点「确认导入」写入");
      } else {
        setImportMessage(`导入完成（策略：${STRATEGY_LABELS[importStrategy] ?? importStrategy}）`);
      }
      setReplaceArmed(false);
      reloadImports();
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setImportBusy(false);
    }
  }

  /** 覆盖模式要连点两次，避免误操作直接清空章节内容。 */
  function requestImport(): void {
    if (importStrategy === "replace" && !replaceArmed) {
      setReplaceArmed(true);
      setImportMessage("覆盖模式会先清空同章节的字幕/笔记/截图/摘要，确认请再点一次「确认覆盖导入」。");
      return;
    }
    void runImport(false);
  }

  async function cancelCurrentImport(): Promise<void> {
    if (!importJob) return;
    try {
      await cancelImport(importJob.id, token);
      setImportMessage("已请求取消");
      reloadImports();
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "取消失败");
    }
  }

  async function downloadReport(job: ImportJobItem): Promise<void> {
    try {
      const blob = await fetchImportReport(job.id, token);
      downloadBlob(blob, `import-${job.id}.json`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "报告下载失败");
    }
  }

  const previewStats = importJob?.stats ?? null;

  return (
    <section className="stacked-page">
      <article className="panel">
        <h2>导出</h2>
        <p>选择课程与格式导出。完整包（.lapkg）包含媒体，可直接带到另一台设备导入；不选课程则导出全部课程。</p>

        <div className="transfer-section">
          <div className="transfer-section-head">
            <strong>选择课程</strong>
            <span className="transfer-muted">
              已选 {effectiveSelection.length} / {courses.length} 门
            </span>
            <button type="button" className="text-button text-button-sm" onClick={() => setSelectedIds([])}>
              清空
            </button>
            <button
              type="button"
              className="text-button text-button-sm"
              onClick={() => setSelectedIds(courses.map((course) => course.id))}
            >
              全选
            </button>
          </div>
          {coursesError ? <p className="form-error">{coursesError}</p> : null}
          <div className="course-pick-list">
            {courses.length === 0 ? <span className="transfer-muted">暂无课程</span> : null}
            {courses.map((course) => (
              <label key={course.id} className="course-pick" data-active={selectedIds.includes(course.id) ? "yes" : "no"}>
                <input type="checkbox" checked={selectedIds.includes(course.id)} onChange={() => toggleCourse(course.id)} />
                <span className="course-pick-title">{course.title}</span>
                {course.archived_at ? <span className="course-pick-tag">已归档</span> : null}
              </label>
            ))}
          </div>
        </div>

        <div className="transfer-row">
          <label className="modal-field">
            <span>导出格式</span>
            <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
              {EXPORT_FORMATS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {exportFormat === "package" ? (
            <label className="filter-item transfer-check">
              <input type="checkbox" checked={includeMedia} onChange={(event) => setIncludeMedia(event.target.checked)} />
              <span>包含截图与笔记图片</span>
            </label>
          ) : null}
        </div>
        {selectedFormat ? <p className="transfer-muted">{selectedFormat.hint}</p> : null}
        {needsSingleCourse && selectedIds.length > 1 ? (
          <p className="form-error">该格式一次只能导出一门课程，已自动使用第一门。</p>
        ) : null}

        <div className="inline-form">
          <button type="button" className="primary-button" disabled={exportsBusy} onClick={() => void submitExport()}>
            {exportsBusy ? "处理中…" : "创建导出"}
          </button>
        </div>
        {exportMessage ? <p>{exportMessage}</p> : null}

        <div className="data-table">
          <div>
            <strong>格式</strong>
            <strong>内容</strong>
            <strong>状态</strong>
            <strong>体积</strong>
            <strong>时间</strong>
            <strong>操作</strong>
          </div>
          {exports.length === 0 ? (
            <div>
              <span>暂无导出记录</span>
            </div>
          ) : null}
          {exports.map((item) => (
            <div key={item.id}>
              <span>{EXPORT_FORMATS.find((format) => format.value === item.format)?.label ?? item.format}</span>
              <span>{describeCounts(item.scope_counts)}</span>
              <span>{statusLabel(item.status)}</span>
              <span>{formatBytes(item.size_bytes)}</span>
              <span>{formatTime(item.created_at)}</span>
              <span>
                {item.status === "completed" ? (
                  <button
                    type="button"
                    className="text-button text-button-sm"
                    onClick={() =>
                      void downloadExport(item.id, token)
                        .then((blob) => downloadBlob(blob, item.file_path?.split(/[\\/]/).pop() || `${item.id}.lapkg`))
                        .catch((error: unknown) => setExportMessage(error instanceof Error ? error.message : "下载失败"))
                    }
                  >
                    下载
                  </button>
                ) : null}
                <button type="button" className="text-button text-button-sm" disabled={exportsBusy} onClick={() => void removeExport(item)}>
                  删除
                </button>
              </span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <h2>导入</h2>
        <p>
          支持完整包 <code>.lapkg</code>（跨设备迁移）、Anki 导出的 <code>.tsv</code> / <code>.txt</code> 卡片，
          以及 <code>.csv</code> 笔记或卡片。建议先「预览」确认会新增哪些内容，再「确认导入」写入。
        </p>

        <div className="transfer-section">
          <input
            ref={fileInputRef}
            type="file"
            accept=".lapkg,.zip,.tsv,.txt,.csv"
            className="transfer-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setImportFile(file);
              setImportJob(null);
              setImportMessage("");
              setReplaceArmed(false);
            }}
          />
          <div className="transfer-row">
            <button type="button" className="primary-button" onClick={() => fileInputRef.current?.click()}>
              选择导入包
            </button>
            <span className="transfer-muted">{importFile ? `${importFile.name} · ${formatBytes(importFile.size)}` : "未选择文件"}</span>
          </div>
          <div className="transfer-row">
            <label className="modal-field">
              <span>导入策略</span>
              <select
                value={importStrategy}
                onChange={(event) => {
                  setImportStrategy(event.target.value as ImportStrategy);
                  setReplaceArmed(false);
                  setImportMessage("");
                }}
              >
                {IMPORT_STRATEGIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="transfer-muted">{IMPORT_STRATEGIES.find((item) => item.value === importStrategy)?.hint}</p>
          <div className="inline-form">
            <button type="button" className="text-button" disabled={importBusy || !importFile} onClick={() => void runImport(true)}>
              {importBusy ? "处理中…" : "预览（不写入）"}
            </button>
            <button type="button" className="primary-button" disabled={importBusy || !importFile} onClick={requestImport}>
              {importStrategy === "replace" && replaceArmed ? "确认覆盖导入" : "确认导入"}
            </button>
            {importJob && ["queued", "validating", "parsing", "applying"].includes(importJob.status) ? (
              <button type="button" className="text-button" onClick={() => void cancelCurrentImport()}>
                取消
              </button>
            ) : null}
          </div>
        </div>

        {importJob ? (
          <div className="import-progress">
            <div className="import-progress-head">
              <strong>{importJob.dry_run ? "预览结果" : "导入结果"}</strong>
              <span>{statusLabel(importJob.status)}</span>
              <span className="transfer-muted">{importJob.progress ?? 0}%</span>
            </div>
            <div className="import-progress-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(Math.max(importJob.progress ?? 0, 0), 100)}%` }} />
            </div>
            {importJob.error ? <p className="form-error">{importJob.error}</p> : null}
            {previewStats ? (
              <div className="stat-grid">
                {STAT_LABELS.map((stat) => (
                  <div key={stat.key} className="stat-cell">
                    <span>{stat.label}</span>
                    <strong>{String(previewStats[stat.key] ?? 0)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {Array.isArray(previewStats?.conflicts) && (previewStats.conflicts as string[]).length > 0 ? (
              <ul className="import-conflicts">
                {(previewStats.conflicts as string[]).slice(0, 5).map((conflict) => (
                  <li key={conflict}>{conflict}</li>
                ))}
              </ul>
            ) : null}
            {importJob.status === "done" ? (
              <button type="button" className="text-button text-button-sm" onClick={() => void downloadReport(importJob)}>
                下载 JSON 报告
              </button>
            ) : null}
          </div>
        ) : null}

        {importMessage ? <p>{importMessage}</p> : null}

        <div className="data-table">
          <div>
            <strong>文件</strong>
            <strong>状态</strong>
            <strong>进度</strong>
            <strong>体积</strong>
            <strong>时间</strong>
            <strong>操作</strong>
          </div>
          {importHistory.length === 0 ? (
            <div>
              <span>暂无导入记录</span>
            </div>
          ) : null}
          {importHistory.map((job) => (
            <div key={job.id}>
              <span>
                {job.source_filename}
                {typeof job.stats?.source_type === "string"
                  ? ` · ${SOURCE_LABELS[job.stats.source_type as string] ?? (job.stats.source_type as string)}`
                  : ""}
              </span>
              <span>
                {statusLabel(job.status)}
                {job.dry_run ? "（预览）" : ""}
                {job.strategy && job.strategy !== "merge" ? ` · ${STRATEGY_LABELS[job.strategy] ?? job.strategy}` : ""}
              </span>
              <span>{job.progress ?? 0}%</span>
              <span>{formatBytes(job.size_bytes)}</span>
              <span>{formatTime(job.created_at)}</span>
              <span>
                {job.status === "done" ? (
                  <button type="button" className="text-button text-button-sm" onClick={() => void downloadReport(job)}>
                    报告
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function describeCounts(counts?: Record<string, unknown> | null): string {
  if (!counts) return "-";
  const parts: string[] = [];
  const pairs: [string, string][] = [
    ["courses", "课程"],
    ["chapters", "章节"],
    ["notes", "笔记"],
    ["screenshots", "截图"],
  ];
  for (const [key, label] of pairs) {
    const value = counts[key];
    if (typeof value === "number" && value > 0) parts.push(`${label} ${value}`);
  }
  return parts.length ? parts.join(" · ") : "-";
}

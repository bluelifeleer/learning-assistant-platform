import { useEffect, useRef, useState } from "react";
import {
  createExport,
  deleteScreenshot,
  downloadExport,
  fetchCourseDetail,
  updateScreenshotImage,
  fetchCourseVideoSources,
  fetchExports,
  fetchScreenshotImageUrl,
  fetchScreenshots,
  type CourseChapterNode,
  type CourseDetail,
  type CourseVideoSourceItem,
  type ExportItem,
  type ScreenshotItem,
} from "../api/client";
import { Modal } from "../components/Modal";
import { NoteCard } from "../components/NoteCard";
import { NoteEditorModal } from "../components/NoteEditorModal";
import { applyNoteCorrection, flattenChapters, formatDateTime, formatTimecode, resolveVideoMedia, sortScreenshotsByTime } from "./courseTree";
import { ScreenshotEditor } from "./ScreenshotEditor";
import { startPluginStatusPolling } from "./pluginPolling";

interface CourseDetailPageProps {
  courseId: string;
  initialChapterId?: string | null;
  token?: string;
  onBack: () => void;
  onSelectChapter?: (chapterId: string | null) => void;
}

const EXPORT_FILE_EXTENSIONS: Record<string, string> = { markdown: "md", json: "json", anki: "txt" };

type ExportFormat = "markdown" | "json" | "anki";

async function downloadExportFile(item: ExportItem, token?: string): Promise<void> {
  const blob = await downloadExport(item.id, token);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = item.file_path?.split(/[\\/]/).pop() || `export-${item.id}.${EXPORT_FILE_EXTENSIONS[item.format] ?? "md"}`;
  link.click();
  URL.revokeObjectURL(url);
}

function CourseExports({ courseId, token, refreshKey, onError }: { courseId: string; token?: string; refreshKey: number; onError: (message: string) => void }) {
  const [items, setItems] = useState<ExportItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchExports()
      .then((result) => {
        if (!cancelled) setItems(result.items.filter((item) => item.course_id === courseId));
      })
      .catch((error: unknown) => {
        if (!cancelled) onError(error instanceof Error ? error.message : "导出记录读取失败");
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, refreshKey]);

  if (!items.length) return null;

  return (
    <article>
      <h3>导出记录</h3>
      <div className="data-table">
        <div><strong>格式</strong><strong>状态</strong><strong>文件</strong></div>
        {items.map((item) => (
          <div key={item.id}>
            <span>{item.format}</span>
            <span>{item.status}</span>
            <span>
              {item.file_path || "-"}
              {item.status === "completed" ? (
                <button type="button" className="text-button text-button-sm" onClick={() => void downloadExportFile(item, token).catch((error: unknown) => onError(error instanceof Error ? error.message : "导出文件下载失败"))}>下载</button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

interface LoadedScreenshot {
  shot: ScreenshotItem;
  url: string;
}

function ChapterScreenshots({ courseId, chapterId, unassignedOnly }: { courseId: string; chapterId?: string; unassignedOnly?: boolean }) {
  const [items, setItems] = useState<LoadedScreenshot[]>([]);
  const [message, setMessage] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const itemsRef = useRef<LoadedScreenshot[]>([]);
  const [viewTransform, setViewTransform] = useState({ scale: 1, rotate: 0 });

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    setViewTransform({ scale: 1, rotate: 0 });
  }, [viewerIndex]);

  function zoomImage(factor: number) {
    setViewTransform((current) => ({
      ...current,
      scale: Math.min(4, Math.max(0.25, Number((current.scale * factor).toFixed(2)))),
    }));
  }

  function rotateImage(degrees: number) {
    setViewTransform((current) => ({ ...current, rotate: (current.rotate + degrees) % 360 }));
  }

  function downloadImage(target: LoadedScreenshot) {
    const link = document.createElement("a");
    link.href = target.url;
    link.download = `截图-${formatTimecode(target.shot.video_time_seconds)}.jpg`;
    link.click();
  }

  async function removeShot(index: number) {
    const target = items[index];
    if (!target || !window.confirm("确定删除这张截图吗?删除后不可恢复。")) return;
    try {
      await deleteScreenshot(target.shot.id);
      URL.revokeObjectURL(target.url);
      const remaining = items.length - 1;
      setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
      setViewerIndex(remaining <= 0 ? null : Math.min(index, remaining - 1));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "截图删除失败");
    }
  }

  async function saveEditedImage(dataUrl: string) {
    if (editingIndex === null) return;
    const target = items[editingIndex];
    if (!target) return;
    await updateScreenshotImage(target.shot.id, dataUrl);
    const freshUrl = await fetchScreenshotImageUrl(target.shot.id);
    URL.revokeObjectURL(target.url);
    setItems((current) => current.map((item, index) => (index === editingIndex ? { ...item, url: freshUrl } : item)));
    setEditingIndex(null);
  }

  useEffect(() => {
    if (viewerIndex === null || !items.length) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (editingIndex !== null) return;
      if (event.key === "Escape") setViewerIndex(null);
      if (event.key === "ArrowLeft") setViewerIndex((index) => (index === null ? null : (index - 1 + items.length) % items.length));
      if (event.key === "ArrowRight") setViewerIndex((index) => (index === null ? null : (index + 1) % items.length));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerIndex, items.length, editingIndex]);

  const viewer = viewerIndex !== null ? items[viewerIndex] : null;

  useEffect(() => {
    let cancelled = false;
    let owned: string[] = [];
    const refresh = async () => {
      const result = await fetchScreenshots(courseId, chapterId);
      const filtered = unassignedOnly ? result.items.filter((shot) => !shot.chapter_id) : result.items;
      const loaded = await Promise.all(
        sortScreenshotsByTime(filtered).map(async (shot) => ({ shot, url: await fetchScreenshotImageUrl(shot.id) })),
      );
      if (cancelled) {
        loaded.forEach(({ url }) => URL.revokeObjectURL(url));
        return;
      }
      // 截图集合没变化时保留原有 objectURL,避免编辑器/查看器被轮询打断重载
      const unchanged = itemsRef.current.length === loaded.length
        && itemsRef.current.every((item, index) => item.shot.id === loaded[index].shot.id);
      if (unchanged) {
        loaded.forEach(({ url }) => URL.revokeObjectURL(url));
      } else {
        owned.forEach((url) => URL.revokeObjectURL(url));
        owned = loaded.map(({ url }) => url);
        setItems(loaded);
      }
      setMessage("");
    };
    setMessage("");
    void refresh().catch((error: unknown) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : "截图读取失败");
    });
    // 插件截图存证后自动刷新,无需手动切换章节
    const stop = startPluginStatusPolling(refresh, 8000);
    return () => {
      cancelled = true;
      stop();
      owned.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [courseId, chapterId, unassignedOnly]);

  if (!items.length) return message ? <p>{message}</p> : null;

  return (
    <article>
      <h3>{unassignedOnly ? "截图(未分章)" : "截图"}</h3>
      {message ? <p>{message}</p> : null}
      <div className="screenshot-grid">
        {items.map(({ shot, url }, index) => (
          <figure key={shot.id} className="screenshot-card">
            <button type="button" onClick={() => setViewerIndex(index)}>
              <img src={url} alt={`截图 ${formatTimecode(shot.video_time_seconds)}`} />
            </button>
            <figcaption>
              <strong>{formatTimecode(shot.video_time_seconds)}</strong>
              <span>{formatDateTime(shot.created_at)}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      {viewer && viewerIndex !== null ? (
        <div className="screenshot-viewer" role="dialog" aria-label="截图查看" onClick={() => setViewerIndex(null)}>
          <button
            type="button"
            className="screenshot-viewer-nav prev"
            aria-label="上一张"
            onClick={(event) => {
              event.stopPropagation();
              setViewerIndex((viewerIndex - 1 + items.length) % items.length);
            }}
          >
            ‹
          </button>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, maxWidth: "90%" }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <button type="button" className="text-button text-button-sm" onClick={() => zoomImage(1.25)}>放大</button>
              <button type="button" className="text-button text-button-sm" onClick={() => zoomImage(0.8)}>缩小</button>
              <button type="button" className="text-button text-button-sm" onClick={() => rotateImage(-90)}>左旋</button>
              <button type="button" className="text-button text-button-sm" onClick={() => rotateImage(90)}>右旋</button>
              <button type="button" className="text-button text-button-sm" onClick={() => setViewTransform({ scale: 1, rotate: 0 })}>重置</button>
              <button type="button" className="text-button text-button-sm" onClick={() => setEditingIndex(viewerIndex)}>编辑</button>
              <button type="button" className="text-button text-button-sm" onClick={() => downloadImage(viewer)}>下载</button>
              <button type="button" className="text-button text-button-sm" style={{ color: "#e5534b" }} onClick={() => void removeShot(viewerIndex)}>删除</button>
            </div>
            <img
              src={viewer.url}
              alt={`截图 ${formatTimecode(viewer.shot.video_time_seconds)}`}
              style={{
                transform: `scale(${viewTransform.scale}) rotate(${viewTransform.rotate}deg)`,
                transition: "transform .15s ease",
                maxWidth: "100%",
              }}
            />
          </div>
          <button
            type="button"
            className="screenshot-viewer-nav next"
            aria-label="下一张"
            onClick={(event) => {
              event.stopPropagation();
              setViewerIndex((viewerIndex + 1) % items.length);
            }}
          >
            ›
          </button>
          <p>
            {viewerIndex + 1} / {items.length} · {formatTimecode(viewer.shot.video_time_seconds)} · {formatDateTime(viewer.shot.created_at)}(← → 切换,Esc 关闭)
          </p>
        </div>
      ) : null}
      {editingIndex !== null && items[editingIndex] ? (
        <ScreenshotEditor
          imageUrl={items[editingIndex].url}
          onSave={saveEditedImage}
          onClose={() => setEditingIndex(null)}
        />
      ) : null}
    </article>
  );
}

function findChapter(chapters: CourseChapterNode[], id: string): CourseChapterNode | null {
  for (const chapter of chapters) {
    if (chapter.id === id) return chapter;
    const match = findChapter(chapter.children, id);
    if (match) return match;
  }
  return null;
}

function ChapterVideoSource({ item, courseLevel }: { item: CourseVideoSourceItem | undefined; courseLevel?: boolean }) {
  const [copied, setCopied] = useState(false);
  const media = resolveVideoMedia(item);
  if (!item || (!item.course_url && !media)) return null;

  async function copyLink(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article>
      <h3>视频链接{courseLevel ? <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 8 }}>课程级(未匹配到具体章节)</span> : null}{copied ? <span style={{ fontSize: 12, color: "#1f8fff", marginLeft: 8 }}>已复制</span> : null}</h3>
      <div className="record-list">
        <article className="record-row">
          {item.course_url ? (
            <p style={{ wordBreak: "break-all", margin: 0 }}>
              页面链接（长期有效）：<a href={item.course_url} target="_blank" rel="noreferrer">{item.course_url}</a>
              {" "}<button type="button" className="text-button text-button-sm" onClick={() => void copyLink(item.course_url ?? "")}>复制</button>
            </p>
          ) : null}
          {media ? (
            <p style={{ wordBreak: "break-all", margin: "6px 0 0" }}>
              媒体地址（{media.mediaType}{media.expiryWarning ? "，签名/临时链接，可能已过期" : ""}）：
              <code style={{ fontSize: 12 }}>{media.url}</code>
              {" "}<button type="button" className="text-button text-button-sm" onClick={() => void copyLink(media.url)}>复制</button>
            </p>
          ) : null}
          {item.captured_at ? (
            <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.7 }}>采集于 {formatDateTime(item.captured_at)}</p>
          ) : null}
        </article>
      </div>
    </article>
  );
}

export function CourseDetailPage({ courseId, initialChapterId, token, onBack, onSelectChapter }: CourseDetailPageProps) {
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [videoSources, setVideoSources] = useState<CourseVideoSourceItem[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [message, setMessage] = useState("正在读取课程详情...");
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("markdown");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportsRefreshKey, setExportsRefreshKey] = useState(0);

  function reloadDetail() {
    return Promise.all([fetchCourseDetail(courseId), fetchCourseVideoSources(courseId)]).then(([result, sources]) => {
      setDetail(result);
      setVideoSources(sources.items);
      setSelectedChapterId((current) => current ?? flattenChapters(result.chapters)[0]?.chapter.id ?? null);
    });
  }

  useEffect(() => {
    setDetail(null);
    setVideoSources([]);
    setSelectedChapterId(null);
    setMessage("正在读取课程详情...");
    void fetchCourseDetail(courseId)
      .then((result) => {
        setDetail(result);
        const flattened = flattenChapters(result.chapters);
        const fromHash = initialChapterId && flattened.some(({ chapter }) => chapter.id === initialChapterId) ? initialChapterId : null;
        setSelectedChapterId(fromHash ?? flattened[0]?.chapter.id ?? null);
        setMessage(result.chapters.length ? "" : "该课程暂无章节。");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "课程详情读取失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // hash 定位章节(如从复习/搜索跳入)时同步章节树选中态
  useEffect(() => {
    if (initialChapterId) setSelectedChapterId((current) => (current === initialChapterId ? current : initialChapterId));
  }, [initialChapterId]);

  // 插件添加笔记/采集字幕后自动刷新详情,保留当前选中章节
  useEffect(() => {
    const stop = startPluginStatusPolling(() => reloadDetail(), 8000);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  function selectChapter(chapterId: string) {
    setSelectedChapterId(chapterId);
    onSelectChapter?.(chapterId);
  }

  async function submitExport() {
    setExportBusy(true);
    setExportError("");
    try {
      const created = await createExport({ course_id: courseId, export_format: exportFormat }, token);
      // 轮询任务状态,完成后直接触发下载
      for (let attempt = 0; attempt < 8; attempt++) {
        const list = await fetchExports();
        const item = list.items.find((entry) => entry.id === created.id);
        if (item?.status === "completed") {
          await downloadExportFile(item, token);
          break;
        }
        if (item?.status === "failed") throw new Error("导出任务失败");
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      setExportOpen(false);
      setExportsRefreshKey((key) => key + 1);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "导出任务创建失败");
    } finally {
      setExportBusy(false);
    }
  }

  const selectedChapter = detail && selectedChapterId ? findChapter(detail.chapters, selectedChapterId) : null;
  const selectedVideoSource = videoSources.find((item) => item.chapter_id === selectedChapterId);
  const courseLevelVideoSource = videoSources.find((item) => !item.chapter_id);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>课程详情</h2>
        <div className="panel-actions">
          <button type="button" className="text-button" onClick={onBack}>返回列表</button>
          <button type="button" className="text-button" onClick={() => { setExportError(""); setExportOpen(true); }}>导出</button>
          <button type="button" className="primary-button" onClick={() => setNoteEditorOpen(true)}>添加笔记</button>
        </div>
      </div>
      {detail ? <p>{detail.title}{detail.term ? ` · ${detail.term}` : ""}</p> : null}
      {message ? <p>{message}</p> : null}
      {detail && detail.chapters.length ? (
        <div className="course-detail-layout">
          <div className="record-list course-detail-tree">
            {flattenChapters(detail.chapters).map(({ chapter, depth }) => (
              <button
                key={chapter.id}
                type="button"
                className="text-button chapter-tree-button"
                data-active={selectedChapterId === chapter.id ? "yes" : "no"}
                data-depth={depth}
                style={{ paddingLeft: `${depth * 20 + 8}px` }}
                onClick={() => selectChapter(chapter.id)}
              >
                {chapter.title}
              </button>
            ))}
          </div>
          {selectedChapter ? (
            <div className="stacked-page">
              <ChapterVideoSource item={selectedVideoSource ?? courseLevelVideoSource} courseLevel={!selectedVideoSource && Boolean(courseLevelVideoSource)} />
              <article>
                <h3>字幕</h3>
                <div className="record-list">
                  {selectedChapter.transcripts.length ? selectedChapter.transcripts.map((transcript) => (
                    <article key={transcript.id} className="record-row">
                      <strong>{formatTimecode(transcript.start_seconds)} - {formatTimecode(transcript.end_seconds)}</strong>
                      <p>{transcript.text}</p>
                    </article>
                  )) : <p>该章节暂无字幕。</p>}
                </div>
              </article>
              <article>
                <h3>笔记</h3>
                <div className="record-list">
                  {selectedChapter.notes.length ? selectedChapter.notes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      token={token}
                      onMessage={setMessage}
                      onUpdated={(updated) =>
                        setDetail((current) =>
                          current ? { ...current, chapters: applyNoteCorrection(current.chapters, updated.id, updated) } : current,
                        )
                      }
                    />
                  )) : <p>该章节暂无笔记。</p>}
                </div>
              </article>
              <ChapterScreenshots courseId={courseId} chapterId={selectedChapter.id} />
            </div>
          ) : null}
        </div>
      ) : null}
      {detail ? <ChapterScreenshots courseId={courseId} unassignedOnly={detail.chapters.length > 0} /> : null}
      {detail ? (
        <div className="stacked-page" style={{ marginTop: 16 }}>
          <CourseExports courseId={courseId} token={token} refreshKey={exportsRefreshKey} onError={setMessage} />
        </div>
      ) : null}
      {noteEditorOpen ? (
        <NoteEditorModal
          token={token}
          initialCourseId={courseId}
          initialChapterId={selectedChapterId}
          onClose={() => setNoteEditorOpen(false)}
          onSaved={reloadDetail}
        />
      ) : null}
      {exportOpen ? (
        <Modal
          title="导出课程"
          onClose={() => setExportOpen(false)}
          footer={(
            <>
              {exportError ? <span className="form-error">{exportError}</span> : null}
              <button type="button" className="text-button" onClick={() => setExportOpen(false)}>取消</button>
              <button type="button" className="primary-button" disabled={exportBusy} onClick={() => void submitExport()}>
                {exportBusy ? "导出中..." : "创建导出"}
              </button>
            </>
          )}
        >
          <label className="modal-field">
            <span>导出格式</span>
            <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
              <option value="anki">Anki 卡片</option>
            </select>
          </label>
          <p>导出完成后会自动下载文件,记录保留在详情页底部。</p>
        </Modal>
      ) : null}
    </section>
  );
}

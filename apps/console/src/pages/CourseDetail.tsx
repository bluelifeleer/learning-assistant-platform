import { useEffect, useState } from "react";
import {
  deleteScreenshot,
  fetchCourseDetail,
  updateScreenshotImage,
  fetchCourseVideoSources,
  fetchScreenshotImageUrl,
  fetchScreenshots,
  saveNoteCorrection,
  type CourseChapterNode,
  type CourseChapterNote,
  type CourseDetail,
  type CourseVideoSourceItem,
  type NoteItem,
  type ScreenshotItem,
} from "../api/client";
import { applyNoteCorrection, flattenChapters, formatDateTime, formatTimecode, resolveVideoMedia, sortScreenshotsByTime } from "./courseTree";
import { ScreenshotEditor } from "./ScreenshotEditor";
import { startPluginStatusPolling } from "./pluginPolling";

interface CourseDetailPageProps {
  courseId: string;
  onBack: () => void;
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
  const [viewTransform, setViewTransform] = useState({ scale: 1, rotate: 0 });

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
      owned.forEach((url) => URL.revokeObjectURL(url));
      owned = loaded.map(({ url }) => url);
      setItems(loaded);
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

function ChapterNoteRow({ note, onCorrected }: { note: CourseChapterNote; onCorrected: (updated: NoteItem) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hasCorrection = Boolean(note.corrected_content);

  function startEditing() {
    setDraft(note.corrected_content ?? note.content);
    setEditing(true);
    setError("");
  }

  async function save(clear: boolean) {
    setSaving(true);
    setError("");
    try {
      const updated = await saveNoteCorrection(note.id, clear ? null : draft.trim());
      onCorrected(updated);
      setEditing(false);
      setShowOriginal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "勘误保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="record-row">
      <strong>{formatTimecode(note.video_time_seconds)}</strong>
      {(note.tags ?? []).map((tag) => (
        <span key={tag} style={{ fontSize: 12, padding: "1px 8px", marginLeft: 6, borderRadius: 10, background: "#eaf3ff", color: "#1f8fff" }}>{tag}</span>
      ))}
      <p>{hasCorrection ? note.corrected_content : note.content}</p>
      {hasCorrection ? (
        <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.75 }}>
          <span style={{ color: "#1f8fff" }}>已勘误</span>
          {showOriginal ? ` · 原文：${note.content}` : ""}
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {editing ? (
        <div style={{ marginTop: 8 }}>
          <textarea
            rows={4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            style={{ boxSizing: "border-box", width: "100%" }}
            placeholder="填写勘误后的正确内容,原文不会被修改"
          />
          <div style={{ marginTop: 6 }}>
            <button type="button" className="text-button text-button-sm" disabled={saving || !draft.trim()} onClick={() => void save(false)}>
              {saving ? "保存中..." : "保存勘误"}
            </button>
            <button type="button" className="text-button text-button-sm" disabled={saving} onClick={() => setEditing(false)}>取消</button>
            {hasCorrection ? (
              <button type="button" className="text-button text-button-sm" disabled={saving} onClick={() => void save(true)}>恢复原文</button>
            ) : null}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 4 }}>
          <button type="button" className="text-button text-button-sm" onClick={startEditing}>勘误</button>
          {hasCorrection ? (
            <button type="button" className="text-button text-button-sm" onClick={() => setShowOriginal((value) => !value)}>
              {showOriginal ? "隐藏原文" : "查看原文"}
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function CourseDetailPage({ courseId, onBack }: CourseDetailPageProps) {
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [videoSources, setVideoSources] = useState<CourseVideoSourceItem[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [message, setMessage] = useState("正在读取课程详情...");

  useEffect(() => {
    setDetail(null);
    setVideoSources([]);
    setSelectedChapterId(null);
    setMessage("正在读取课程详情...");
    void fetchCourseDetail(courseId)
      .then((result) => {
        setDetail(result);
        const flattened = flattenChapters(result.chapters);
        setSelectedChapterId(flattened[0]?.chapter.id ?? null);
        setMessage(result.chapters.length ? "" : "该课程暂无章节。");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "课程详情读取失败"));
  }, [courseId]);

  // 插件添加笔记/采集字幕后自动刷新详情,保留当前选中章节
  useEffect(() => {
    const stop = startPluginStatusPolling(async () => {
      const [result, sources] = await Promise.all([fetchCourseDetail(courseId), fetchCourseVideoSources(courseId)]);
      setDetail(result);
      setVideoSources(sources.items);
      setSelectedChapterId((current) => current ?? flattenChapters(result.chapters)[0]?.chapter.id ?? null);
    }, 8000);
    return stop;
  }, [courseId]);

  const selectedChapter = detail && selectedChapterId ? findChapter(detail.chapters, selectedChapterId) : null;
  const selectedVideoSource = videoSources.find((item) => item.chapter_id === selectedChapterId);
  const courseLevelVideoSource = videoSources.find((item) => !item.chapter_id);

  return (
    <section className="panel">
      <h2>
        课程详情
        <button type="button" className="text-button" onClick={onBack}>返回列表</button>
      </h2>
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
                onClick={() => setSelectedChapterId(chapter.id)}
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
                    <ChapterNoteRow
                      key={note.id}
                      note={note}
                      onCorrected={(updated) =>
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
    </section>
  );
}

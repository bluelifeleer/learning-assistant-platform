import { useEffect, useState } from "react";
import {
  fetchCourseDetail,
  fetchScreenshotImageUrl,
  fetchScreenshots,
  type CourseChapterNode,
  type CourseDetail,
  type ScreenshotItem,
} from "../api/client";
import { flattenChapters, formatDateTime, formatTimecode, sortScreenshotsByTime } from "./courseTree";

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

  useEffect(() => {
    if (viewerIndex === null || !items.length) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerIndex(null);
      if (event.key === "ArrowLeft") setViewerIndex((index) => (index === null ? null : (index - 1 + items.length) % items.length));
      if (event.key === "ArrowRight") setViewerIndex((index) => (index === null ? null : (index + 1) % items.length));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerIndex, items.length]);

  const viewer = viewerIndex !== null ? items[viewerIndex] : null;

  useEffect(() => {
    let cancelled = false;
    const owned: string[] = [];
    setItems([]);
    setMessage("");
    void fetchScreenshots(courseId, chapterId)
      .then((result) =>
        Promise.all(
          sortScreenshotsByTime(unassignedOnly ? result.items.filter((shot) => !shot.chapter_id) : result.items).map(
            async (shot) => ({ shot, url: await fetchScreenshotImageUrl(shot.id) }),
          ),
        ),
      )
      .then((loaded) => {
        if (cancelled) {
          loaded.forEach(({ url }) => URL.revokeObjectURL(url));
          return;
        }
        owned.push(...loaded.map(({ url }) => url));
        setItems(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "截图读取失败");
      });
    return () => {
      cancelled = true;
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
          <img src={viewer.url} alt={`截图 ${formatTimecode(viewer.shot.video_time_seconds)}`} onClick={(event) => event.stopPropagation()} />
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

export function CourseDetailPage({ courseId, onBack }: CourseDetailPageProps) {
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [message, setMessage] = useState("正在读取课程详情...");

  useEffect(() => {
    setDetail(null);
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

  const selectedChapter = detail && selectedChapterId ? findChapter(detail.chapters, selectedChapterId) : null;

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
                    <article key={note.id} className="record-row">
                      <strong>{formatTimecode(note.video_time_seconds)}</strong>
                      <p>{note.content}</p>
                    </article>
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

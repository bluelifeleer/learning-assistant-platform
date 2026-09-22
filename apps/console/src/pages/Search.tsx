import { useEffect, useMemo, useState } from "react";
import { fetchCourses, searchContent, type CourseItem, type SearchResult } from "../api/client";
import { CourseChapterPicker, EMPTY_COURSE_CHAPTER_FILTER, useCourseChapters, type CourseChapterFilter } from "../components/CourseChapterPicker";
import { buildRouteHash } from "../navSlug";
import { chapterAndDescendantIds, formatTimecode } from "./courseTree";

function openCourse(courseId: string, chapterId?: string | null) {
  if (typeof window === "undefined") return;
  window.location.hash = buildRouteHash("课程", { courseId, chapterId });
}

export function Search() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [message, setMessage] = useState("");
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [filter, setFilter] = useState<CourseChapterFilter>(EMPTY_COURSE_CHAPTER_FILTER);
  const chapters = useCourseChapters(filter.courseId);

  useEffect(() => {
    void fetchCourses()
      .then((courseResult) => setCourses(courseResult.items))
      .catch(() => undefined);
  }, []);

  async function submitSearch() {
    const keyword = query.trim();
    if (!keyword) return;
    setMessage("正在搜索...");
    try {
      const next = await searchContent(keyword);
      setResult(next);
      setMessage(next.notes.length || next.transcripts.length ? "" : "没有匹配的结果。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "搜索失败");
    }
  }

  const filtered = useMemo(() => {
    if (!result) return null;
    const allowed = filter.sectionId
      ? new Set([filter.sectionId])
      : filter.chapterId
        ? chapterAndDescendantIds(chapters, filter.chapterId)
        : null;
    const inScope = (courseId: string, chapterId: string | null | undefined) =>
      (!filter.courseId || courseId === filter.courseId)
      && (!allowed || (chapterId != null && allowed.has(chapterId)));
    return {
      notes: result.notes.filter((note) => inScope(note.course_id, note.chapter_id)),
      transcripts: result.transcripts.filter((transcript) => inScope(transcript.course_id, transcript.chapter_id)),
    };
  }, [result, filter, chapters]);

  return (
    <section className="panel">
      <h2>搜索</h2>
      <div className="search-controls">
        <CourseChapterPicker courses={courses} value={filter} onChange={setFilter} />
        <div className="inline-form search-form">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submitSearch();
            }}
            placeholder="搜索笔记与字幕"
          />
          <button type="button" onClick={() => void submitSearch()}>搜索</button>
        </div>
      </div>
      {message ? <p>{message}</p> : null}
      {filtered ? (
        <div className="stacked-page">
          <article>
            <h3>笔记 ({filtered.notes.length})</h3>
            <div className="record-list">
              {filtered.notes.map((note) => (
                <article key={note.id} className="record-row record-link" role="link" tabIndex={0}
                  onClick={() => openCourse(note.course_id, note.chapter_id)}
                  onKeyDown={(event) => { if (event.key === "Enter") openCourse(note.course_id, note.chapter_id); }}
                >
                  <strong>{note.course_title}{note.chapter_title ? ` / ${note.chapter_title}` : ""} · {formatTimecode(note.video_time_seconds)}</strong>
                  {(note.tags ?? []).map((tag) => (
                    <span key={tag} className="note-tag">{tag}</span>
                  ))}
                  <p>{note.corrected_content ?? note.content}</p>
                  <span className="record-link-hint">定位到课程章节 ›</span>
                </article>
              ))}
            </div>
          </article>
          <article>
            <h3>字幕 ({filtered.transcripts.length})</h3>
            <div className="record-list">
              {filtered.transcripts.map((transcript) => (
                <article key={transcript.id} className="record-row record-link" role="link" tabIndex={0}
                  onClick={() => openCourse(transcript.course_id, transcript.chapter_id)}
                  onKeyDown={(event) => { if (event.key === "Enter") openCourse(transcript.course_id, transcript.chapter_id); }}
                >
                  <strong>{transcript.course_title} / {transcript.chapter_title} · {formatTimecode(transcript.start_seconds)}</strong>
                  <p>{transcript.text}</p>
                  <span className="record-link-hint">定位到课程章节 ›</span>
                </article>
              ))}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}

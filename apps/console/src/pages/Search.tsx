import { useEffect, useMemo, useState } from "react";
import { fetchCourses, searchContent, type CourseItem, type SearchResult } from "../api/client";
import { CourseChapterPicker, EMPTY_COURSE_CHAPTER_FILTER, useCourseChapters, type CourseChapterFilter } from "../components/CourseChapterPicker";
import { chapterAndDescendantIds, formatTimecode } from "./courseTree";

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
      <div style={{ marginBottom: 12 }}>
        <CourseChapterPicker courses={courses} value={filter} onChange={setFilter} />
      </div>
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
      {message ? <p>{message}</p> : null}
      {filtered ? (
        <div className="stacked-page">
          <article>
            <h3>笔记 ({filtered.notes.length})</h3>
            <div className="record-list">
              {filtered.notes.map((note) => (
                <article key={note.id} className="record-row">
                  <strong>{note.course_title}{note.chapter_title ? ` / ${note.chapter_title}` : ""} · {formatTimecode(note.video_time_seconds)}</strong>
                  {(note.tags ?? []).map((tag) => (
                    <span key={tag} style={{ fontSize: 12, padding: "1px 8px", marginLeft: 6, borderRadius: 10, background: "#eaf3ff", color: "#1f8fff" }}>{tag}</span>
                  ))}
                  <p>{note.corrected_content ?? note.content}</p>
                </article>
              ))}
            </div>
          </article>
          <article>
            <h3>字幕 ({filtered.transcripts.length})</h3>
            <div className="record-list">
              {filtered.transcripts.map((transcript) => (
                <article key={transcript.id} className="record-row">
                  <strong>{transcript.course_title} / {transcript.chapter_title} · {formatTimecode(transcript.start_seconds)}</strong>
                  <p>{transcript.text}</p>
                </article>
              ))}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}

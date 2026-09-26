import { useEffect, useMemo, useState } from "react";
import { fetchAllNotes, fetchCourses, type CourseItem, type NoteItem } from "../api/client";
import { buildRouteHash } from "../navSlug";
import { formatTimecode } from "./courseTree";
import { filterNotesByTags, groupNotesByCourse, NOTE_TAG_FILTERS, noteDisplayContent } from "./notesGrouping";

export function Notes() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [courseId, setCourseId] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [message, setMessage] = useState("正在读取笔记...");

  useEffect(() => {
    void Promise.all([fetchAllNotes(), fetchCourses()])
      .then(([noteResult, courseResult]) => {
        setNotes(noteResult.items);
        setCourses(courseResult.items);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "笔记读取失败"));
  }, []);

  const filtered = useMemo(() => {
    const byCourse = courseId ? notes.filter((note) => note.course_id === courseId) : notes;
    return filterNotesByTags(byCourse, activeTags);
  }, [notes, courseId, activeTags]);
  const groups = useMemo(() => groupNotesByCourse(filtered), [filtered]);

  function toggleTag(tag: string) {
    setActiveTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  function openSource(note: NoteItem) {
    window.location.hash = buildRouteHash("课程", { courseId: note.course_id, chapterId: note.chapter_id ?? undefined });
  }

  return (
    <section className="panel">
      <h2>笔记</h2>
      <div className="page-filter">
        <select value={courseId} onChange={(event) => setCourseId(event.target.value)} aria-label="按课程筛选">
          <option value="">全部课程</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>{course.title}</option>
          ))}
        </select>
        {/* 之前用的是行内标签徽章的样式(.note-tag)且 .note-tag-active 根本没定义,
            选中状态在界面上完全没有反馈;改用与标签选择器一致的 chip 样式 */}
        <div className="tag-picker">
          {NOTE_TAG_FILTERS.map((tag) => (
            <button
              key={tag}
              type="button"
              className="tag-chip"
              data-active={activeTags.includes(tag) ? "yes" : "no"}
              aria-pressed={activeTags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
      {message ? <p>{message}</p> : null}
      {!message && !groups.length ? <p>还没有笔记，去课程详情页添加。</p> : null}
      {groups.map((group) => (
        <section key={group.course_id} className="note-group">
          <h3>{group.course_title}</h3>
          <div className="record-list">
            {group.items.map((note) => (
              <article key={note.id} className="record-row">
                <div>
                  <button type="button" className="text-button text-button-sm" onClick={() => openSource(note)}>
                    {note.chapter_title ?? "未匹配章节"}
                    {note.video_time_seconds != null ? ` · ${formatTimecode(note.video_time_seconds)}` : ""} ›
                  </button>
                </div>
                <p>{noteDisplayContent(note)}</p>
                <div>
                  {(note.tags ?? []).map((tag) => (
                    <span key={tag} className="note-tag">{tag}</span>
                  ))}
                  {note.created_at ? <span className="note-meta">{new Date(note.created_at).toLocaleDateString()}</span> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

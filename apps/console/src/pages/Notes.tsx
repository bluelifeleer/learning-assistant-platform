import { useEffect, useState } from "react";
import { API_BASE_URL, fetchCourses, fetchNotes, type CourseItem, type NoteItem } from "../api/client";

interface NotesProps {
  token?: string;
}

export function Notes({ token }: NotesProps) {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [courseId, setCourseId] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("正在读取笔记...");

  async function refresh() {
    const [courseResult, noteResult] = await Promise.all([fetchCourses(), fetchNotes()]);
    setCourses(courseResult.items);
    setNotes(noteResult.items);
    setCourseId((current) => current || courseResult.items[0]?.id || "");
    setMessage(noteResult.items.length ? "" : "暂无笔记。");
  }

  useEffect(() => {
    void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "笔记读取失败"));
  }, []);

  async function createNote() {
    if (!token) {
      setMessage("请先登录后再添加笔记");
      return;
    }
    if (!courseId || !content.trim()) return;
    const response = await fetch(`${API_BASE_URL}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ course_id: courseId, content }),
    });
    if (!response.ok) {
      setMessage(`笔记保存失败: ${response.status}`);
      return;
    }
    setContent("");
    await refresh();
  }

  return (
    <section className="panel">
      <h2>笔记</h2>
      <div className="inline-form">
        <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
          {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
        </select>
        <input value={content} onChange={(event) => setContent(event.target.value)} placeholder="添加一条笔记" />
        <button type="button" onClick={() => void createNote()}>添加</button>
      </div>
      {message ? <p>{message}</p> : null}
      <div className="record-list">
        {notes.map((note) => (
          <article key={note.id} className="record-row">
            <strong>{note.course_title}</strong>
            <p>{note.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

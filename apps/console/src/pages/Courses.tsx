import { useEffect, useState } from "react";
import { fetchCourses, type CourseItem } from "../api/client";

export function Courses() {
  const [items, setItems] = useState<CourseItem[]>([]);
  const [message, setMessage] = useState("正在读取课程...");

  useEffect(() => {
    void fetchCourses()
      .then((result) => {
        setItems(result.items);
        setMessage(result.items.length ? "" : "暂无课程，插件采集后会显示在这里。");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "课程读取失败"));
  }, []);

  return (
    <section className="panel">
      <h2>课程</h2>
      {message ? <p>{message}</p> : null}
      <div className="data-table">
        <div><strong>课程</strong><strong>学期</strong><strong>章节</strong><strong>字幕</strong><strong>笔记</strong></div>
        {items.map((course) => (
          <div key={course.id}>
            <span>{course.title}</span>
            <span>{course.term || "-"}</span>
            <span>{course.chapter_count}</span>
            <span>{course.transcript_count}</span>
            <span>{course.note_count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

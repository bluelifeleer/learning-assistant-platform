import { useEffect, useState } from "react";
import { createExport, fetchCourses, fetchExports, type CourseItem, type ExportItem } from "../api/client";

interface ExportsProps {
  token?: string;
}

export function Exports({ token }: ExportsProps) {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [items, setItems] = useState<ExportItem[]>([]);
  const [courseId, setCourseId] = useState("");
  const [format, setFormat] = useState<"markdown" | "json">("markdown");
  const [message, setMessage] = useState("正在读取导出任务...");

  async function refresh() {
    const [courseResult, exportResult] = await Promise.all([fetchCourses(), fetchExports()]);
    setCourses(courseResult.items);
    setItems(exportResult.items);
    setCourseId((current) => current || courseResult.items[0]?.id || "");
    setMessage(exportResult.items.length ? "" : "暂无导出任务。");
  }

  useEffect(() => {
    void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "导出任务读取失败"));
  }, []);

  async function submitExport() {
    if (!token) {
      setMessage("请先登录后再创建导出任务");
      return;
    }
    await createExport({ course_id: courseId || null, format }, token);
    await refresh();
  }

  return (
    <section className="panel">
      <h2>导出</h2>
      <div className="inline-form">
        <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
          {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
        </select>
        <select value={format} onChange={(event) => setFormat(event.target.value as "markdown" | "json")}>
          <option value="markdown">Markdown</option>
          <option value="json">JSON</option>
        </select>
        <button type="button" onClick={() => void submitExport()}>创建导出</button>
      </div>
      {message ? <p>{message}</p> : null}
      <div className="data-table">
        <div><strong>课程</strong><strong>格式</strong><strong>状态</strong><strong>文件</strong></div>
        {items.map((item) => (
          <div key={item.id}><span>{item.course_title || "-"}</span><span>{item.format}</span><span>{item.status}</span><span>{item.file_path || "-"}</span></div>
        ))}
      </div>
    </section>
  );
}

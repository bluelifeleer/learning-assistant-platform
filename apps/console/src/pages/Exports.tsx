import { useEffect, useState } from "react";
import { createExport, downloadExport, fetchCourses, fetchExports, type CourseItem, type ExportItem } from "../api/client";

const EXPORT_FILE_EXTENSIONS: Record<string, string> = { markdown: "md", json: "json", anki: "txt" };

interface ExportsProps {
  token?: string;
}

export function Exports({ token }: ExportsProps) {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [items, setItems] = useState<ExportItem[]>([]);
  const [courseId, setCourseId] = useState("");
  const [format, setFormat] = useState<"markdown" | "json" | "anki">("markdown");
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
    try {
      await createExport({ course_id: courseId || null, export_format: format }, token);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出任务创建失败");
    }
  }

  async function handleDownload(item: ExportItem) {
    try {
      const blob = await downloadExport(item.id, token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.file_path?.split(/[\\/]/).pop() || `export-${item.id}.${EXPORT_FILE_EXTENSIONS[item.format] ?? "md"}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出文件下载失败");
    }
  }

  return (
    <section className="panel">
      <h2>导出</h2>
      <div className="inline-form export-form">
        <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
          {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
        </select>
        <select value={format} onChange={(event) => setFormat(event.target.value as "markdown" | "json" | "anki")}>
          <option value="markdown">Markdown</option>
          <option value="json">JSON</option>
          <option value="anki">Anki 卡片</option>
        </select>
        <button type="button" onClick={() => void submitExport()}>创建导出</button>
      </div>
      {message && message !== "暂无导出任务。" ? <p>{message}</p> : null}
      {items.length ? (
        <div className="data-table">
          <div><strong>课程</strong><strong>格式</strong><strong>状态</strong><strong>文件</strong></div>
          {items.map((item) => (
            <div key={item.id}>
              <span>{item.course_title || "-"}</span>
              <span>{item.format}</span>
              <span>{item.status}</span>
              <span>
                {item.file_path || "-"}
                {item.status === "completed" ? (
                  <button type="button" className="text-button" onClick={() => void handleDownload(item)}>下载</button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : message === "暂无导出任务。" ? (
        <div className="empty-state">
          <strong>暂无导出任务</strong>
          <span>选择课程和格式,创建第一个导出任务。</span>
        </div>
      ) : null}
    </section>
  );
}

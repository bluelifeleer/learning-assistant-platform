import { useEffect, useMemo, useState } from "react";
import { bulkArchiveCourses, deleteCourse, fetchCourses, updateCourse, type CourseItem } from "../api/client";
import { ListToolbar, RowActions, ToolbarSearch, ToolbarSelect } from "../components/ListControls";
import { matchesKeyword, sortItems } from "../listQuery";
import { toast } from "../components/toast";

interface CoursesProps {
  onOpenDetail?: (courseId: string) => void;
}

const SORT_OPTIONS = [
  { value: "updated", label: "最近更新" },
  { value: "title", label: "按标题" },
  { value: "chapters", label: "按章节数" },
  { value: "notes", label: "按笔记数" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "在读" },
  { value: "archived", label: "已归档" },
  { value: "all", label: "全部" },
];

function formatUpdated(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function Courses({ onOpenDetail }: CoursesProps) {
  const [items, setItems] = useState<CourseItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("active");
  const [sort, setSort] = useState("updated");
  const [message, setMessage] = useState("正在读取课程...");
  const [busyId, setBusyId] = useState<string | null>(null);
  // 删除是不可逆操作：第一次点只是"上膛"，按钮变成「确认删除」，再点才真删
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // 归档状态在客户端切换,所以一次把全部课程取回来,由筛选器决定显示哪些
  useEffect(() => {
    void fetchCourses(undefined, true)
      .then((result) => {
        setItems(result.items);
        setMessage(result.items.length ? "" : "暂无课程，插件采集后会显示在这里。");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "课程读取失败"));
  }, []);

  const visible = useMemo(() => {
    const filtered = items.filter((course) => {
      const archived = Boolean(course.archived_at);
      if (status === "active" && archived) return false;
      if (status === "archived" && !archived) return false;
      return matchesKeyword([course.title, course.term, course.site_name], keyword);
    });
    switch (sort) {
      case "title":
        return sortItems(filtered, (course) => course.title);
      case "chapters":
        return sortItems(filtered, (course) => course.chapter_count, "desc");
      case "notes":
        return sortItems(filtered, (course) => course.note_count, "desc");
      default:
        return sortItems(filtered, (course) => course.updated_at ?? "", "desc");
    }
  }, [items, keyword, status, sort]);

  async function toggleArchived(course: CourseItem): Promise<void> {
    const archived = !course.archived_at;
    setBusyId(course.id);
    try {
      const updated = await updateCourse(course.id, { archived });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success(archived ? `已归档《${course.title}》` : `已取消归档《${course.title}》`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function rename(course: CourseItem): Promise<void> {
    const next = window.prompt("课程名称", course.title);
    if (next === null) return;
    const title = next.trim();
    if (!title || title === course.title) return;
    setBusyId(course.id);
    try {
      const updated = await updateCourse(course.id, { title });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success("已更新课程名称");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重命名失败");
    } finally {
      setBusyId(null);
    }
  }

  async function editTerm(course: CourseItem): Promise<void> {
    const next = window.prompt("学期(留空表示不设置)", course.term ?? "");
    if (next === null) return;
    const term = next.trim();
    if (term === (course.term ?? "")) return;
    setBusyId(course.id);
    try {
      const updated = await updateCourse(course.id, { term });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success("已更新学期");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新学期失败");
    } finally {
      setBusyId(null);
    }
  }

  async function requestDelete(course: CourseItem): Promise<void> {
    if (deleteArmed !== course.id) {
      setDeleteArmed(course.id);
      toast.info(`再点一次「确认删除」会永久删除《${course.title}》及其章节、笔记、截图`);
      return;
    }
    setDeleteArmed(null);
    setBusyId(course.id);
    try {
      const result = await deleteCourse(course.id);
      setItems((current) => current.filter((item) => item.id !== course.id));
      toast.success(`已删除《${course.title}》（${result.chapters} 章节，清理 ${result.files_removed} 个文件）`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  async function bulkArchive(archived: boolean): Promise<void> {
    const ids = visible.map((course) => course.id);
    if (!ids.length) return;
    if (!window.confirm(`${archived ? "归档" : "恢复"}当前列表里的 ${ids.length} 门课程？`)) return;
    setBulkBusy(true);
    try {
      const result = await bulkArchiveCourses(ids, archived);
      const updated = await fetchCourses(undefined, true);
      setItems(updated.items);
      toast.success(`已${archived ? "归档" : "恢复"} ${result.updated} 门课程`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量操作失败");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>课程</h2>
      {message ? <p>{message}</p> : null}
      <ListToolbar count={visible.length} total={items.length}>
        <ToolbarSearch value={keyword} onChange={setKeyword} placeholder="搜索课程名 / 学期 / 站点" />
        <ToolbarSelect label="状态" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <ToolbarSelect label="排序" value={sort} onChange={setSort} options={SORT_OPTIONS} />
        <div className="inline-form">
          <button
            type="button"
            className="text-button-sm"
            disabled={bulkBusy || !visible.length}
            onClick={() => void bulkArchive(true)}
          >
            归档当前 {visible.length} 门
          </button>
          <button
            type="button"
            className="text-button-sm"
            disabled={bulkBusy || !visible.length}
            onClick={() => void bulkArchive(false)}
          >
            恢复当前 {visible.length} 门
          </button>
        </div>
      </ListToolbar>

      {visible.length ? (
        <div className="course-grid">
          {visible.map((course) => (
            <article
              key={course.id}
              className="course-card"
              data-archived={course.archived_at ? "yes" : "no"}
              role="link"
              tabIndex={0}
              onClick={() => onOpenDetail?.(course.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onOpenDetail?.(course.id);
              }}
            >
              <div className="course-card-head">
                <span className="course-card-title">{course.title}</span>
                <RowActions>
                  <button
                    type="button"
                    className="text-button-sm"
                    title="重命名"
                    disabled={busyId === course.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void rename(course);
                    }}
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    className="text-button-sm"
                    title="修改学期"
                    disabled={busyId === course.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void editTerm(course);
                    }}
                  >
                    学期
                  </button>
                  <button
                    type="button"
                    className="text-button-sm"
                    title={course.archived_at ? "取消归档" : "归档(不在默认列表显示)"}
                    disabled={busyId === course.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleArchived(course);
                    }}
                  >
                    {course.archived_at ? "恢复" : "归档"}
                  </button>
                  <button
                    type="button"
                    className="text-button-sm"
                    data-tone={deleteArmed === course.id ? "danger" : undefined}
                    title="永久删除课程及其章节、笔记、截图"
                    disabled={busyId === course.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void requestDelete(course);
                    }}
                  >
                    {deleteArmed === course.id ? "确认删除" : "删除"}
                  </button>
                </RowActions>
              </div>
              <div className="course-card-meta">
                <span>{course.site_name}</span>
                {course.term ? <span>· {course.term}</span> : null}
                {course.archived_at ? <span className="pill" data-tone="muted">已归档</span> : null}
              </div>
              <div className="course-card-stats">
                <span><b>{course.chapter_count}</b> 章节</span>
                <span><b>{course.transcript_count}</b> 字幕</span>
                <span><b>{course.note_count}</b> 笔记</span>
                <span style={{ marginLeft: "auto" }}>{formatUpdated(course.updated_at)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>{items.length ? "没有匹配的课程" : "暂无课程"}</strong>
          <span>{items.length ? "换个关键词或把状态切到「全部」试试" : "插件采集后课程会显示在这里"}</span>
        </div>
      )}
    </section>
  );
}

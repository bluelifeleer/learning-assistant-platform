import { useEffect, useMemo, useState } from "react";
import {
  bulkDeleteNotes,
  bulkTagNotes,
  deleteNote,
  fetchAllNotes,
  fetchCourses,
  type CourseItem,
  type NoteItem,
} from "../api/client";
import { BulkBar, ListToolbar, RowActions, ToolbarSearch, ToolbarSelect } from "../components/ListControls";
import { toast } from "../components/toast";
import { buildRouteHash } from "../navSlug";
import { matchesKeyword, sortItems, toggleAllIds, toggleId } from "../listQuery";
import { formatTimecode } from "./courseTree";
import { filterNotesByTags, groupNotesByCourse, NOTE_TAG_FILTERS, noteDisplayContent } from "./notesGrouping";

const SORT_OPTIONS = [
  { value: "created_desc", label: "最新在前" },
  { value: "created_asc", label: "最早在前" },
  { value: "course", label: "按课程" },
];

const BULK_TAG_OPTIONS = NOTE_TAG_FILTERS;

export function Notes() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [courseId, setCourseId] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("created_desc");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("正在读取笔记...");
  const [busy, setBusy] = useState(false);

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
    const byTag = filterNotesByTags(byCourse, activeTags);
    return byTag.filter((note) =>
      matchesKeyword(
        [note.content, note.corrected_content, note.course_title, note.chapter_title, ...(note.tags ?? [])],
        keyword,
      ),
    );
  }, [notes, courseId, activeTags, keyword]);

  const sorted = useMemo(() => {
    switch (sort) {
      case "created_asc":
        return sortItems(filtered, (note) => note.created_at ?? "");
      case "course":
        return sortItems(filtered, (note) => `${note.course_title} ${note.chapter_title ?? ""}`);
      default:
        return sortItems(filtered, (note) => note.created_at ?? "", "desc");
    }
  }, [filtered, sort]);

  const groups = useMemo(() => groupNotesByCourse(sorted), [sorted]);
  const visibleIds = useMemo(() => sorted.map((note) => note.id), [sorted]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  function toggleTag(tag: string) {
    setActiveTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  function openSource(note: NoteItem) {
    window.location.hash = buildRouteHash("课程", { courseId: note.course_id, chapterId: note.chapter_id ?? undefined });
  }

  function dropNote(noteId: string) {
    setNotes((current) => current.filter((note) => note.id !== noteId));
    setSelected((current) => current.filter((id) => id !== noteId));
  }

  async function removeOne(note: NoteItem): Promise<void> {
    if (!window.confirm("删除这条笔记?该操作不可撤销。")) return;
    setBusy(true);
    try {
      await deleteNote(note.id);
      dropNote(note.id);
      toast.success("已删除笔记");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyOne(note: NoteItem): Promise<void> {
    const text = noteDisplayContent(note);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("浏览器拒绝了剪贴板访问");
    }
  }

  async function removeSelected(): Promise<void> {
    if (!window.confirm(`删除选中的 ${selected.length} 条笔记?该操作不可撤销。`)) return;
    setBusy(true);
    try {
      const result = await bulkDeleteNotes(selected);
      const removed = new Set(selected);
      setNotes((current) => current.filter((note) => !removed.has(note.id)));
      setSelected([]);
      toast.success(`已删除 ${result.affected} 条笔记`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function tagSelected(mode: "add" | "remove"): Promise<void> {
    const input = window.prompt(
      mode === "add" ? `给 ${selected.length} 条笔记加标签(多个用逗号分隔)` : `从 ${selected.length} 条笔记移除标签`,
      BULK_TAG_OPTIONS[0],
    );
    if (input === null) return;
    const tags = input.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean);
    if (!tags.length) return;
    setBusy(true);
    try {
      await bulkTagNotes(selected, tags, mode);
      const touched = new Set(selected);
      setNotes((current) =>
        current.map((note) => {
          if (!touched.has(note.id)) return note;
          const currentTags = note.tags ?? [];
          const nextTags =
            mode === "add"
              ? Array.from(new Set([...currentTags, ...tags]))
              : currentTags.filter((tag) => !tags.includes(tag));
          return { ...note, tags: nextTags };
        }),
      );
      toast.success(mode === "add" ? `已为 ${selected.length} 条笔记加标签` : `已移除标签`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量改标签失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>笔记</h2>
      <ListToolbar count={sorted.length} total={notes.length}>
        <ToolbarSearch value={keyword} onChange={setKeyword} placeholder="搜索笔记内容 / 课程 / 章节 / 标签" />
        <ToolbarSelect
          label="课程"
          value={courseId}
          onChange={setCourseId}
          options={[{ value: "", label: "全部课程" }, ...courses.map((course) => ({ value: course.id, label: course.title }))]}
        />
        <ToolbarSelect label="排序" value={sort} onChange={setSort} options={SORT_OPTIONS} />
      </ListToolbar>

      <div className="page-filter">
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
        {visibleIds.length ? (
          <button
            type="button"
            className="text-button-sm"
            onClick={() => setSelected(toggleAllIds(selected, visibleIds, !allSelected))}
          >
            {allSelected ? "取消全选" : "全选当前结果"}
          </button>
        ) : null}
      </div>

      {message ? <p>{message}</p> : null}
      {!message && !groups.length ? (
        <div className="empty-state">
          <strong>{notes.length ? "没有匹配的笔记" : "还没有笔记"}</strong>
          <span>{notes.length ? "换个关键词,或清掉标签筛选试试" : "去课程详情页添加第一条笔记"}</span>
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.course_id} className="note-group">
          <h3>{group.course_title}</h3>
          <div className="record-list">
            {group.items.map((note) => (
              <article key={note.id} className="record-row" data-selected={selected.includes(note.id) ? "yes" : "no"}>
                <div className="note-row-head">
                  <input
                    type="checkbox"
                    checked={selected.includes(note.id)}
                    aria-label="选择这条笔记"
                    onChange={() => setSelected(toggleId(selected, note.id))}
                  />
                  <button type="button" className="text-button text-button-sm" onClick={() => openSource(note)}>
                    {note.chapter_title ?? "未匹配章节"}
                    {note.video_time_seconds != null ? ` · ${formatTimecode(note.video_time_seconds)}` : ""} ›
                  </button>
                  <RowActions>
                    <button type="button" className="text-button-sm" disabled={busy} onClick={() => void copyOne(note)}>复制</button>
                    <button type="button" className="text-button-sm" onClick={() => openSource(note)}>定位</button>
                    <button type="button" className="text-button-sm danger-text" disabled={busy} onClick={() => void removeOne(note)}>删除</button>
                  </RowActions>
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

      <BulkBar count={selected.length} onClear={() => setSelected([])}>
        <button type="button" className="text-button-sm" disabled={busy} onClick={() => void tagSelected("add")}>加标签</button>
        <button type="button" className="text-button-sm" disabled={busy} onClick={() => void tagSelected("remove")}>去标签</button>
        <button type="button" className="text-button-sm danger-text" disabled={busy} onClick={() => void removeSelected()}>删除</button>
      </BulkBar>
    </section>
  );
}

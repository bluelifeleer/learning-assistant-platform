import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from "react";
import { createNote, createReviewCard, fetchCourses, fetchNotes, uploadNoteImage, type CourseItem, type NoteItem } from "../api/client";
import { Modal } from "../components/Modal";
import { NoteMarkdown } from "./NoteMarkdown";
import { formatTimecode } from "./courseTree";

interface NotesProps {
  token?: string;
}

type EditorMode = "edit" | "preview";
type MarkdownTool = "bold" | "heading" | "list" | "quote";

export function Notes({ token }: NotesProps) {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [message, setMessage] = useState("正在读取笔记...");
  const [editorOpen, setEditorOpen] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [content, setContent] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  function openEditor() {
    setFormError("");
    setEditorMode("edit");
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setFormError("");
  }

  function insertMarkdown(tool: MarkdownTool) {
    const textarea = editorRef.current;
    if (!textarea) return;
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    let next = value;
    let cursor = end;
    if (tool === "bold") {
      const text = value.slice(start, end) || "粗体文字";
      next = `${value.slice(0, start)}**${text}**${value.slice(end)}`;
      cursor = start + text.length + 4;
    } else {
      const prefix = tool === "list" ? "- " : tool === "quote" ? "> " : "## ";
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
      cursor = end + prefix.length;
    }
    setContent(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function insertSnippet(snippet: string) {
    const textarea = editorRef.current;
    if (!textarea) {
      setContent((current) => current + snippet);
      return;
    }
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    setContent(value.slice(0, start) + snippet + value.slice(end));
    const cursor = start + snippet.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(file);
    });
  }

  async function uploadAndInsertImage(file: File) {
    if (!token) {
      setFormError("请先登录后再上传图片");
      return;
    }
    setImageUploading(true);
    setFormError("");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await uploadNoteImage(dataUrl, token);
      insertSnippet(`![图片](note-image:${result.id})`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setImageUploading(false);
    }
  }

  function handleEditorPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void uploadAndInsertImage(file);
  }

  async function submitNote() {
    if (!token) {
      setFormError("请先登录后再添加笔记");
      return;
    }
    if (!courseId || !content.trim()) {
      setFormError("请选择课程并填写笔记内容");
      return;
    }
    setSaving(true);
    try {
      await createNote({ course_id: courseId, content }, token);
      setContent("");
      closeEditor();
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "笔记保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function generateCard(note: NoteItem) {
    try {
      await createReviewCard(note.id, token);
      setMessage("已生成复习卡片");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "复习卡片生成失败");
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>笔记</h2>
        <button type="button" className="primary-button" onClick={openEditor}>添加笔记</button>
      </div>
      {message ? <p>{message}</p> : null}
      <div className="record-list">
        {notes.map((note) => {
          const meta: string[] = [];
          if (note.video_time_seconds != null) meta.push(`时间码 ${formatTimecode(note.video_time_seconds)}`);
          if (note.created_at) meta.push(`创建于 ${note.created_at.slice(0, 10)}`);
          return (
            <article key={note.id} className="record-row note-card">
              <div className="note-card-head">
                <strong>{note.course_title}</strong>
                <button type="button" className="text-button text-button-sm" onClick={() => void generateCard(note)}>生成卡片</button>
              </div>
              <NoteMarkdown content={note.content} token={token} className="markdown-preview note-card-content" />
              {meta.length ? (
                <footer className="note-meta">
                  {meta.map((item) => <span key={item}>{item}</span>)}
                </footer>
              ) : null}
            </article>
          );
        })}
      </div>
      {editorOpen ? (
        <Modal
          title="添加笔记"
          onClose={closeEditor}
          footer={(
            <>
              {formError ? <span className="form-error">{formError}</span> : null}
              <button type="button" className="text-button" onClick={closeEditor}>取消</button>
              <button type="button" className="primary-button" disabled={saving} onClick={() => void submitNote()}>
                {saving ? "保存中..." : "保存笔记"}
              </button>
            </>
          )}
        >
          <label className="modal-field">
            <span>所属课程</span>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
          <div className="modal-field">
            <span>笔记内容(支持 Markdown)</span>
            <div className="md-editor">
              <div className="md-toolbar">
                <button type="button" className="tool" onClick={() => insertMarkdown("bold")}>加粗</button>
                <button type="button" className="tool" onClick={() => insertMarkdown("heading")}>标题</button>
                <button type="button" className="tool" onClick={() => insertMarkdown("list")}>列表</button>
                <button type="button" className="tool" onClick={() => insertMarkdown("quote")}>引用</button>
                <button type="button" className="tool" disabled={imageUploading} onClick={() => fileInputRef.current?.click()}>
                  {imageUploading ? "上传中..." : "图片"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadAndInsertImage(file);
                  }}
                />
                <div className="segmented md-mode">
                  <button type="button" data-active={editorMode === "edit" ? "yes" : "no"} onClick={() => setEditorMode("edit")}>编辑</button>
                  <button type="button" data-active={editorMode === "preview" ? "yes" : "no"} onClick={() => setEditorMode("preview")}>预览</button>
                </div>
              </div>
              {editorMode === "edit" ? (
                <textarea
                  ref={editorRef}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  onPaste={handleEditorPaste}
                  placeholder="记录这条笔记的内容,支持 **粗体**、## 标题、- 列表、> 引用,可直接粘贴图片。"
                />
              ) : content.trim() ? (
                <NoteMarkdown content={content} token={token} className="markdown-preview" />
              ) : (
                <div className="markdown-preview"><span className="preview-empty">暂无内容,切换到编辑模式输入。</span></div>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

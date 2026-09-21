import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from "react";
import { createCourse, createNote, createReviewCard, fetchCourseDetail, fetchCourses, fetchNotes, saveNoteCorrection, saveNoteTags, uploadNoteImage, type CourseChapterNode, type CourseItem, type NoteItem } from "../api/client";
import { Modal } from "../components/Modal";
import { NoteMarkdown } from "./NoteMarkdown";
import { formatTimecode } from "./courseTree";
import { startPluginStatusPolling } from "./pluginPolling";

interface NotesProps {
  token?: string;
}

type EditorMode = "edit" | "preview";
type MarkdownTool = "bold" | "heading" | "list" | "quote";

export const NOTE_TAGS = ["考点", "高频", "普通", "简答", "多选", "单选"];

const NEW_COURSE_VALUE = "__new__";

export function TagPicker({ selected, onToggle }: { selected: string[]; onToggle: (tag: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {NOTE_TAGS.map((tag) => {
        const active = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            style={{
              padding: "4px 16px",
              borderRadius: 999,
              border: `1px solid ${active ? "#1f8fff" : "#d5dde8"}`,
              background: active ? "#1f8fff" : "#f5f8fc",
              color: active ? "#fff" : "#44536a",
              cursor: "pointer",
              fontSize: 13,
            }}
            onClick={() => onToggle(tag)}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}

function toggleTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
}

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
  const [correctingNote, setCorrectingNote] = useState<NoteItem | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState("");
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [correctionError, setCorrectionError] = useState("");
  const [newCourseMode, setNewCourseMode] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [chapterOptions, setChapterOptions] = useState<CourseChapterNode[]>([]);
  const [chapterId, setChapterId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState("");
  const [taggingNote, setTaggingNote] = useState<NoteItem | null>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [tagSaving, setTagSaving] = useState(false);
  const [tagError, setTagError] = useState("");
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

  // 插件在学习页添加笔记后,控制台无需手动切换页面即可看到
  useEffect(() => {
    const stop = startPluginStatusPolling(async () => {
      const noteResult = await fetchNotes();
      setNotes(noteResult.items);
    }, 8000);
    return stop;
  }, []);

  function openEditor() {
    setFormError("");
    setEditorMode("edit");
    setEditorOpen(true);
    setNewCourseMode(false);
    setNewCourseTitle("");
    setChapterOptions([]);
    setChapterId("");
    setSectionId("");
    setSelectedTags([]);
    if (courseId) loadChapterOptions(courseId);
  }

  function closeEditor() {
    setEditorOpen(false);
    setFormError("");
  }

  function loadChapterOptions(targetCourseId: string) {
    void fetchCourseDetail(targetCourseId)
      .then((detail) => setChapterOptions(detail.chapters))
      .catch(() => setChapterOptions([]));
  }

  function handleCourseChange(value: string) {
    setChapterId("");
    setSectionId("");
    if (value === NEW_COURSE_VALUE) {
      setNewCourseMode(true);
      setChapterOptions([]);
      return;
    }
    setNewCourseMode(false);
    setCourseId(value);
    loadChapterOptions(value);
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
    if (!newCourseMode && !courseId) {
      setFormError("请选择课程");
      return;
    }
    if (newCourseMode && !newCourseTitle.trim()) {
      setFormError("请填写新课程名称");
      return;
    }
    if (!content.trim()) {
      setFormError("请填写笔记内容");
      return;
    }
    setSaving(true);
    try {
      let targetCourseId = courseId;
      if (newCourseMode) {
        const created = await createCourse(newCourseTitle.trim(), token);
        targetCourseId = created.id;
      }
      await createNote({
        course_id: targetCourseId,
        chapter_id: sectionId || chapterId || null,
        content,
        tags: selectedTags,
      }, token);
      setContent("");
      setSelectedTags([]);
      closeEditor();
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "笔记保存失败");
    } finally {
      setSaving(false);
    }
  }

  function openTagEditor(note: NoteItem) {
    setTaggingNote(note);
    setTagDraft(note.tags ?? []);
    setTagError("");
  }

  async function submitTags() {
    if (!taggingNote) return;
    setTagSaving(true);
    setTagError("");
    try {
      const updated = await saveNoteTags(taggingNote.id, tagDraft, token);
      setNotes((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setTaggingNote(null);
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "标签保存失败");
    } finally {
      setTagSaving(false);
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

  function openCorrection(note: NoteItem) {
    setCorrectingNote(note);
    setCorrectionDraft(note.corrected_content ?? note.content);
    setCorrectionError("");
  }

  async function submitCorrection(clear: boolean) {
    if (!correctingNote) return;
    setCorrectionSaving(true);
    setCorrectionError("");
    try {
      const updated = await saveNoteCorrection(correctingNote.id, clear ? null : correctionDraft.trim(), token);
      setNotes((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setCorrectingNote(null);
      setMessage(clear ? "已恢复为原文" : "勘误已保存,原文保持不变");
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : "勘误保存失败");
    } finally {
      setCorrectionSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>笔记</h2>
        <button type="button" className="primary-button" onClick={openEditor}>添加笔记</button>
      </div>
      {message ? <p>{message}</p> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {["", ...NOTE_TAGS].map((tag) => {
          const active = tagFilter === tag;
          return (
            <button
              key={tag || "全部"}
              type="button"
              style={{
                padding: "3px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? "#1f8fff" : "#d5dde8"}`,
                background: active ? "#1f8fff" : "#f5f8fc",
                color: active ? "#fff" : "#44536a",
                cursor: "pointer",
                fontSize: 12,
              }}
              onClick={() => setTagFilter(tag)}
            >
              {tag || "全部"}
            </button>
          );
        })}
      </div>
      <div className="record-list">
        {notes.filter((note) => !tagFilter || (note.tags ?? []).includes(tagFilter)).map((note) => {
          const meta: string[] = [];
          if (note.video_time_seconds != null) meta.push(`时间码 ${formatTimecode(note.video_time_seconds)}`);
          if (note.created_at) meta.push(`创建于 ${note.created_at.slice(0, 10)}`);
          return (
            <article key={note.id} className="record-row note-card">
              <div className="note-card-head">
                <strong>{note.course_title}</strong>
                {note.chapter_title ? <span style={{ fontSize: 12, opacity: 0.7 }}>{note.chapter_title}</span> : null}
                {(note.tags ?? []).map((tag) => (
                  <span key={tag} style={{ fontSize: 12, padding: "1px 8px", borderRadius: 10, background: "#eaf3ff", color: "#1f8fff" }}>{tag}</span>
                ))}
                {note.corrected_content ? <span style={{ fontSize: 12, color: "#1f8fff" }}>已勘误</span> : null}
                <button type="button" className="text-button text-button-sm" onClick={() => openTagEditor(note)}>标签</button>
                <button type="button" className="text-button text-button-sm" onClick={() => openCorrection(note)}>勘误</button>
                <button type="button" className="text-button text-button-sm" onClick={() => void generateCard(note)}>生成卡片</button>
              </div>
              <NoteMarkdown content={note.corrected_content ?? note.content} token={token} className="markdown-preview note-card-content" />
              {note.corrected_content ? (
                <details style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                  <summary>查看原文</summary>
                  <p style={{ whiteSpace: "pre-wrap" }}>{note.content}</p>
                </details>
              ) : null}
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
          <div style={{ display: "flex", gap: 12 }}>
            <label className="modal-field" style={{ flex: 1, margin: 0 }}>
              <span>所属课程</span>
              <select value={newCourseMode ? NEW_COURSE_VALUE : courseId} onChange={(event) => handleCourseChange(event.target.value)}>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                <option value={NEW_COURSE_VALUE}>＋ 新建课程…</option>
              </select>
            </label>
            {newCourseMode ? (
              <label className="modal-field" style={{ flex: 2, margin: 0 }}>
                <span>新课程名称</span>
                <input
                  value={newCourseTitle}
                  onChange={(event) => setNewCourseTitle(event.target.value)}
                  placeholder="例如:中共党史(2026 春)"
                />
              </label>
            ) : (
              <>
                <label className="modal-field" style={{ flex: 1, margin: 0 }}>
                  <span>所属章(可选)</span>
                  <select value={chapterId} disabled={!chapterOptions.length} onChange={(event) => { setChapterId(event.target.value); setSectionId(""); }}>
                    <option value="">不关联章节</option>
                    {chapterOptions.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                  </select>
                </label>
                <label className="modal-field" style={{ flex: 1, margin: 0 }}>
                  <span>所属节(可选)</span>
                  <select
                    value={sectionId}
                    disabled={!(chapterOptions.find((chapter) => chapter.id === chapterId)?.children.length)}
                    onChange={(event) => setSectionId(event.target.value)}
                  >
                    <option value="">整章</option>
                    {(chapterOptions.find((chapter) => chapter.id === chapterId)?.children ?? []).map((section) => (
                      <option key={section.id} value={section.id}>{section.title}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="modal-field">
            <span>标签(可多选)</span>
            <TagPicker selected={selectedTags} onToggle={(tag) => setSelectedTags((current) => toggleTag(current, tag))} />
          </div>
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
      {correctingNote ? (
        <Modal
          title="勘误笔记(原文保留不变)"
          onClose={() => setCorrectingNote(null)}
          footer={(
            <>
              {correctionError ? <span className="form-error">{correctionError}</span> : null}
              {correctingNote.corrected_content ? (
                <button type="button" className="text-button" disabled={correctionSaving} onClick={() => void submitCorrection(true)}>恢复原文</button>
              ) : null}
              <button type="button" className="text-button" onClick={() => setCorrectingNote(null)}>取消</button>
              <button type="button" className="primary-button" disabled={correctionSaving || !correctionDraft.trim()} onClick={() => void submitCorrection(false)}>
                {correctionSaving ? "保存中..." : "保存勘误"}
              </button>
            </>
          )}
        >
          <div className="modal-field">
            <span>原文(字幕识别内容,不可修改)</span>
            <p style={{ whiteSpace: "pre-wrap", opacity: 0.75, margin: "4px 0 0" }}>{correctingNote.content}</p>
          </div>
          <label className="modal-field">
            <span>勘误后的正确内容</span>
            <textarea
              rows={5}
              value={correctionDraft}
              onChange={(event) => setCorrectionDraft(event.target.value)}
              placeholder="例如:学史明理、学史增信、学史崇德、学史力行"
            />
          </label>
        </Modal>
      ) : null}
      {taggingNote ? (
        <Modal
          title="编辑标签"
          onClose={() => setTaggingNote(null)}
          footer={(
            <>
              {tagError ? <span className="form-error">{tagError}</span> : null}
              <button type="button" className="text-button" onClick={() => setTaggingNote(null)}>取消</button>
              <button type="button" className="primary-button" disabled={tagSaving} onClick={() => void submitTags()}>
                {tagSaving ? "保存中..." : "保存标签"}
              </button>
            </>
          )}
        >
          <div className="modal-field">
            <span>标签(可多选)</span>
            <TagPicker selected={tagDraft} onToggle={(tag) => setTagDraft((current) => toggleTag(current, tag))} />
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

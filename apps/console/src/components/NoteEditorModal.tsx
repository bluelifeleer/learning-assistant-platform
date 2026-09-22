import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from "react";
import { createCourse, createNote, fetchCourseDetail, fetchCourses, uploadNoteImage, type CourseChapterNode, type CourseItem } from "../api/client";
import { Modal } from "./Modal";
import { TagPicker } from "./NoteCard";
import { NoteMarkdown } from "../pages/NoteMarkdown";

type EditorMode = "edit" | "preview";
type MarkdownTool = "bold" | "heading" | "list" | "quote";

const NEW_COURSE_VALUE = "__new__";

function locateChapter(chapters: CourseChapterNode[], id: string): { chapterId: string; sectionId: string } | null {
  for (const chapter of chapters) {
    if (chapter.id === id) return { chapterId: id, sectionId: "" };
    if (chapter.children.some((child) => child.id === id)) return { chapterId: chapter.id, sectionId: id };
  }
  return null;
}

interface NoteEditorModalProps {
  token?: string;
  initialCourseId?: string;
  initialChapterId?: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export function NoteEditorModal({ token, initialCourseId, initialChapterId, onClose, onSaved }: NoteEditorModalProps) {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [courseId, setCourseId] = useState(initialCourseId ?? "");
  const [content, setContent] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [newCourseMode, setNewCourseMode] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [chapterOptions, setChapterOptions] = useState<CourseChapterNode[]>([]);
  const [chapterId, setChapterId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const initialChapterApplied = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCourses()
      .then((result) => {
        if (cancelled) return;
        setCourses(result.items);
        setCourseId((current) => current || result.items[0]?.id || "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!courseId || newCourseMode) {
      setChapterOptions([]);
      return;
    }
    let cancelled = false;
    void fetchCourseDetail(courseId)
      .then((detail) => {
        if (cancelled) return;
        setChapterOptions(detail.chapters);
        if (!initialChapterApplied.current && initialChapterId) {
          initialChapterApplied.current = true;
          const located = locateChapter(detail.chapters, initialChapterId);
          if (located) {
            setChapterId(located.chapterId);
            setSectionId(located.sectionId);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setChapterOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, newCourseMode, initialChapterId]);

  function handleCourseChange(value: string) {
    setChapterId("");
    setSectionId("");
    initialChapterApplied.current = true;
    if (value === NEW_COURSE_VALUE) {
      setNewCourseMode(true);
      return;
    }
    setNewCourseMode(false);
    setCourseId(value);
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
      await onSaved();
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "笔记保存失败");
    } finally {
      setSaving(false);
    }
  }

  const selectedChapter = chapterOptions.find((chapter) => chapter.id === chapterId);

  return (
    <Modal
      title="添加笔记"
      onClose={onClose}
      footer={(
        <>
          {formError ? <span className="form-error">{formError}</span> : null}
          <button type="button" className="text-button" onClick={onClose}>取消</button>
          <button type="button" className="primary-button" disabled={saving} onClick={() => void submitNote()}>
            {saving ? "保存中..." : "保存笔记"}
          </button>
        </>
      )}
    >
      <div className="modal-field-row">
        <label className="modal-field" style={{ flex: 1 }}>
          <span>所属课程</span>
          <select value={newCourseMode ? NEW_COURSE_VALUE : courseId} onChange={(event) => handleCourseChange(event.target.value)}>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            <option value={NEW_COURSE_VALUE}>+ 新建课程…</option>
          </select>
        </label>
        {newCourseMode ? (
          <label className="modal-field" style={{ flex: 2 }}>
            <span>新课程名称</span>
            <input
              value={newCourseTitle}
              onChange={(event) => setNewCourseTitle(event.target.value)}
              placeholder="例如:中共党史(2026 春)"
            />
          </label>
        ) : (
          <>
            <label className="modal-field" style={{ flex: 1 }}>
              <span>所属章(可选)</span>
              <select value={chapterId} disabled={!chapterOptions.length} onChange={(event) => { setChapterId(event.target.value); setSectionId(""); }}>
                <option value="">不关联章节</option>
                {chapterOptions.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
              </select>
            </label>
            <label className="modal-field" style={{ flex: 1 }}>
              <span>所属节(可选)</span>
              <select
                value={sectionId}
                disabled={!selectedChapter?.children.length}
                onChange={(event) => setSectionId(event.target.value)}
              >
                <option value="">整章</option>
                {(selectedChapter?.children ?? []).map((section) => (
                  <option key={section.id} value={section.id}>{section.title}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <div className="modal-field">
        <span>标签(可多选)</span>
        <TagPicker selected={selectedTags} onToggle={(tag) => setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]))} />
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
  );
}

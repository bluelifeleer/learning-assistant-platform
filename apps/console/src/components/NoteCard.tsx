import { useState } from "react";
import { createReviewCard, saveNoteCorrection, saveNoteTags, sendNoteEmail, updateNote, type CourseChapterNote, type NoteItem } from "../api/client";
import { Modal } from "./Modal";
import { toast, goToSettings } from "./toast";
import { NoteMarkdown } from "../pages/NoteMarkdown";
import { isNotConfiguredError } from "../pages/aiTasks";
import { formatTimecode } from "../pages/courseTree";

export const NOTE_TAGS = ["考点", "高频", "普通", "简答", "多选", "单选"];

function toggleTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
}

export function TagPicker({ selected, onToggle }: { selected: string[]; onToggle: (tag: string) => void }) {
  return (
    <div className="tag-picker">
      {NOTE_TAGS.map((tag) => (
        <button
          key={tag}
          type="button"
          className="tag-chip"
          data-active={selected.includes(tag) ? "yes" : "no"}
          onClick={() => onToggle(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

type NoteCardNote = CourseChapterNote & Partial<Pick<NoteItem, "course_title" | "chapter_title">>;

/** 同一个编辑器的两种模式:勘误保留原文,编辑直接覆盖。 */
export type NoteEditorMode = "edit" | "correct";

export const NOTE_EDITOR_MODES: { value: NoteEditorMode; label: string }[] = [
  { value: "correct", label: "勘误模式" },
  { value: "edit", label: "编辑模式" },
];

const EDITOR_MODE_HINT: Record<NoteEditorMode, string> = {
  correct: "勘误模式：保留原文另存勘误内容，可随时「恢复原文」。",
  edit: "编辑模式：直接覆盖笔记原文（已有的勘误会被清除）。",
};

interface NoteEditorFieldsProps {
  mode: NoteEditorMode;
  original: string;
  draft: string;
  onModeChange: (mode: NoteEditorMode) => void;
  onDraftChange: (value: string) => void;
}

/** 编辑器主体:两种模式共用一个文本框,仅「是否展示原文」与文案不同。 */
export function NoteEditorFields({ mode, original, draft, onModeChange, onDraftChange }: NoteEditorFieldsProps) {
  return (
    <>
      <div className="modal-field">
        <span>模式</span>
        <div className="segmented" role="tablist">
          {NOTE_EDITOR_MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              data-active={mode === item.value ? "yes" : "no"}
              onClick={() => onModeChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="modal-hint">{EDITOR_MODE_HINT[mode]}</p>
      </div>
      {mode === "correct" ? (
        <div className="modal-field">
          <span>原文(字幕识别内容,不可修改)</span>
          <p className="note-original-text">{original}</p>
        </div>
      ) : null}
      <label className="modal-field">
        <span>{mode === "correct" ? "勘误后的正确内容" : "笔记内容(支持 Markdown)"}</span>
        <textarea
          rows={5}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={
            mode === "correct"
              ? "填写勘误后的正确内容,原文不会被修改"
              : "编辑笔记内容,支持 **粗体**、## 标题、- 列表、> 引用"
          }
        />
      </label>
    </>
  );
}

interface NoteCardProps {
  note: NoteCardNote;
  token?: string;
  showSource?: boolean;
  onUpdated: (updated: NoteItem) => void;
  onMessage?: (message: string) => void;
}

export function NoteCard({ note, token, showSource, onUpdated, onMessage }: NoteCardProps) {
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [tagSaving, setTagSaving] = useState(false);
  const [tagError, setTagError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<NoteEditorMode>("edit");
  const [editorDraft, setEditorDraft] = useState("");
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState("");

  const meta: string[] = [];
  if (note.video_time_seconds != null) meta.push(`时间码 ${formatTimecode(note.video_time_seconds)}`);
  if (note.created_at) meta.push(`创建于 ${note.created_at.slice(0, 10)}`);

  function openTagEditor() {
    setTagDraft(note.tags ?? []);
    setTagError("");
    setTagEditorOpen(true);
  }

  async function submitTags() {
    setTagSaving(true);
    setTagError("");
    try {
      const updated = await saveNoteTags(note.id, tagDraft, token);
      onUpdated(updated);
      setTagEditorOpen(false);
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "标签保存失败");
    } finally {
      setTagSaving(false);
    }
  }

  function openEditor(mode: NoteEditorMode) {
    // 两种模式共用一个编辑器,只是保存去向不同;草稿都以当前显示内容为准
    setEditorMode(mode);
    setEditorDraft(note.corrected_content ?? note.content);
    setEditorError("");
    setEditorOpen(true);
  }

  async function submitEditor(clear = false) {
    const next = editorDraft.trim();
    if (!clear && !next) {
      setEditorError("笔记内容不能为空");
      return;
    }
    setEditorSaving(true);
    setEditorError("");
    try {
      // 底层同一套逻辑,仅在写回字段上区分:勘误写 corrected_content,编辑覆盖 content
      const updated = editorMode === "correct"
        ? await saveNoteCorrection(note.id, clear ? null : next, token)
        : await updateNote(note.id, next, token);
      onUpdated(updated);
      setEditorOpen(false);
      onMessage?.(editorMode === "correct"
        ? (clear ? "已恢复为原文" : "勘误已保存,原文保持不变")
        : "笔记已更新");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "笔记保存失败");
    } finally {
      setEditorSaving(false);
    }
  }

  async function generateCard() {
    try {
      await createReviewCard(note.id, token);
      onMessage?.("已生成复习卡片");
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "复习卡片生成失败");
    }
  }

  async function sendToEmail() {
    try {
      const result = await sendNoteEmail(note.id, token);
      if (result.ok) {
        toast.success("已发送到邮箱");
      } else {
        toast.error(`发送失败：${result.detail ?? "未知原因"}`);
      }
    } catch (error) {
      if (isNotConfiguredError(error)) {
        toast.error("SMTP 未配置，请先在设置页配置邮箱", {
          action: { label: "去配置", onClick: () => goToSettings("general") },
        });
      } else {
        toast.error(error instanceof Error ? error.message : "发送失败");
      }
    }
  }

  return (
    <article className="record-row note-card">
      <div className="note-card-head">
        {showSource && note.course_title ? (
          <strong>{note.course_title}{note.chapter_title ? ` / ${note.chapter_title}` : ""}</strong>
        ) : (
          <strong>{formatTimecode(note.video_time_seconds)}</strong>
        )}
        {(note.tags ?? []).map((tag) => (
          <span key={tag} className="note-tag">{tag}</span>
        ))}
        {note.corrected_content ? <span className="note-corrected">已勘误</span> : null}
        <span className="note-card-actions">
          <button type="button" className="text-button text-button-sm" title="编辑模式:直接覆盖原文" onClick={() => openEditor("edit")}>编辑</button>
          <button type="button" className="text-button text-button-sm" onClick={openTagEditor}>标签</button>
          <button type="button" className="text-button text-button-sm" title="勘误模式:保留原文并另存勘误内容" onClick={() => openEditor("correct")}>勘误</button>
          <button type="button" className="text-button text-button-sm" onClick={() => void generateCard()}>生成卡片</button>
          <button type="button" className="text-button text-button-sm" onClick={() => void sendToEmail()}>发送</button>
        </span>
      </div>
      <NoteMarkdown content={note.corrected_content ?? note.content} token={token} className="markdown-preview note-card-content" />
      {note.corrected_content ? (
        <details className="note-original">
          <summary>查看原文</summary>
          <p>{note.content}</p>
        </details>
      ) : null}
      {meta.length ? (
        <footer className="note-meta">
          {meta.map((item) => <span key={item}>{item}</span>)}
        </footer>
      ) : null}
      {tagEditorOpen ? (
        <Modal
          title="编辑标签"
          onClose={() => setTagEditorOpen(false)}
          footer={(
            <>
              {tagError ? <span className="form-error">{tagError}</span> : null}
              <button type="button" className="text-button" onClick={() => setTagEditorOpen(false)}>取消</button>
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
      {editorOpen ? (
        <Modal
          title={editorMode === "correct" ? "勘误笔记" : "编辑笔记"}
          onClose={() => setEditorOpen(false)}
          footer={(
            <>
              {editorError ? <span className="form-error">{editorError}</span> : null}
              {editorMode === "correct" && note.corrected_content ? (
                <button type="button" className="text-button" disabled={editorSaving} onClick={() => void submitEditor(true)}>恢复原文</button>
              ) : null}
              <button type="button" className="text-button" onClick={() => setEditorOpen(false)}>取消</button>
              <button
                type="button"
                className="primary-button"
                disabled={editorSaving || !editorDraft.trim()}
                onClick={() => void submitEditor(false)}
              >
                {editorSaving ? "保存中..." : editorMode === "correct" ? "保存勘误" : "保存编辑"}
              </button>
            </>
          )}
        >
          <NoteEditorFields
            mode={editorMode}
            original={note.content}
            draft={editorDraft}
            onModeChange={setEditorMode}
            onDraftChange={setEditorDraft}
          />
        </Modal>
      ) : null}
    </article>
  );
}

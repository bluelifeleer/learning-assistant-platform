import { useState } from "react";
import { createReviewCard, saveNoteCorrection, saveNoteTags, type CourseChapterNote, type NoteItem } from "../api/client";
import { Modal } from "./Modal";
import { NoteMarkdown } from "../pages/NoteMarkdown";
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
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionDraft, setCorrectionDraft] = useState("");
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [correctionError, setCorrectionError] = useState("");

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

  function openCorrection() {
    setCorrectionDraft(note.corrected_content ?? note.content);
    setCorrectionError("");
    setCorrectionOpen(true);
  }

  async function submitCorrection(clear: boolean) {
    setCorrectionSaving(true);
    setCorrectionError("");
    try {
      const updated = await saveNoteCorrection(note.id, clear ? null : correctionDraft.trim(), token);
      onUpdated(updated);
      setCorrectionOpen(false);
      onMessage?.(clear ? "已恢复为原文" : "勘误已保存,原文保持不变");
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : "勘误保存失败");
    } finally {
      setCorrectionSaving(false);
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
          <button type="button" className="text-button text-button-sm" onClick={openTagEditor}>标签</button>
          <button type="button" className="text-button text-button-sm" onClick={openCorrection}>勘误</button>
          <button type="button" className="text-button text-button-sm" onClick={() => void generateCard()}>生成卡片</button>
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
      {correctionOpen ? (
        <Modal
          title="勘误笔记(原文保留不变)"
          onClose={() => setCorrectionOpen(false)}
          footer={(
            <>
              {correctionError ? <span className="form-error">{correctionError}</span> : null}
              {note.corrected_content ? (
                <button type="button" className="text-button" disabled={correctionSaving} onClick={() => void submitCorrection(true)}>恢复原文</button>
              ) : null}
              <button type="button" className="text-button" onClick={() => setCorrectionOpen(false)}>取消</button>
              <button type="button" className="primary-button" disabled={correctionSaving || !correctionDraft.trim()} onClick={() => void submitCorrection(false)}>
                {correctionSaving ? "保存中..." : "保存勘误"}
              </button>
            </>
          )}
        >
          <div className="modal-field">
            <span>原文(字幕识别内容,不可修改)</span>
            <p className="note-original-text">{note.content}</p>
          </div>
          <label className="modal-field">
            <span>勘误后的正确内容</span>
            <textarea
              rows={5}
              value={correctionDraft}
              onChange={(event) => setCorrectionDraft(event.target.value)}
              placeholder="填写勘误后的正确内容,原文不会被修改"
            />
          </label>
        </Modal>
      ) : null}
    </article>
  );
}

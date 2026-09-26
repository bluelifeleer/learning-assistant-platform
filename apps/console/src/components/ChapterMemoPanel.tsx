import { useEffect, useState } from "react";
import { fetchChapterMemo, saveChapterMemo } from "../api/client";
import { NoteMarkdown } from "../pages/NoteMarkdown";

interface ChapterMemoPanelProps {
  chapterId: string;
  token?: string;
}

/** 章节「总结」模块:用户手写/编辑的总结,与 AI 生成的章节摘要相互独立。 */
export function ChapterMemoPanel({ chapterId, token }: ChapterMemoPanelProps) {
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEditing(false);
    setError("");
    void fetchChapterMemo(chapterId, token)
      .then((memo) => {
        if (cancelled) return;
        setContent(memo.content_md ?? "");
        setDraft(memo.content_md ?? "");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "总结读取失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId, token]);

  function startEdit() {
    setDraft(content);
    setError("");
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(content);
    setError("");
    setEditing(false);
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const saved = await saveChapterMemo(chapterId, draft, token);
      setContent(saved.content_md ?? "");
      setDraft(saved.content_md ?? "");
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "总结保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article>
      <div className="section-head">
        <h3>总结</h3>
        {editing ? null : (
          <button type="button" className="text-button text-button-sm" onClick={startEdit}>
            {content.trim() ? "编辑" : "写总结"}
          </button>
        )}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {editing ? (
        <div className="memo-editor">
          <textarea
            rows={8}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="记录本章总结,支持 **粗体**、## 标题、- 列表、> 引用"
          />
          <div className="memo-editor-actions">
            <button type="button" className="text-button" disabled={saving} onClick={cancelEdit}>取消</button>
            <button type="button" className="primary-button" disabled={saving} onClick={() => void submit()}>
              {saving ? "保存中..." : "保存总结"}
            </button>
          </div>
        </div>
      ) : loading ? (
        <p>正在读取总结...</p>
      ) : content.trim() ? (
        <NoteMarkdown content={content} token={token} className="markdown-preview" />
      ) : (
        <p>暂无总结,点击「写总结」记录本章要点。</p>
      )}
    </article>
  );
}

import { useState } from "react";
import { searchContent, type SearchResult } from "../api/client";
import { formatTimecode } from "./courseTree";

export function Search() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [message, setMessage] = useState("");

  async function submitSearch() {
    const keyword = query.trim();
    if (!keyword) return;
    setMessage("正在搜索...");
    try {
      const next = await searchContent(keyword);
      setResult(next);
      setMessage(next.notes.length || next.transcripts.length ? "" : "没有匹配的结果。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "搜索失败");
    }
  }

  return (
    <section className="panel">
      <h2>搜索</h2>
      <div className="inline-form search-form">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submitSearch();
          }}
          placeholder="搜索笔记与字幕"
        />
        <button type="button" onClick={() => void submitSearch()}>搜索</button>
      </div>
      {message ? <p>{message}</p> : null}
      {result ? (
        <div className="stacked-page">
          <article>
            <h3>笔记 ({result.notes.length})</h3>
            <div className="record-list">
              {result.notes.map((note) => (
                <article key={note.id} className="record-row">
                  <strong>{note.course_title}{note.chapter_title ? ` / ${note.chapter_title}` : ""} · {formatTimecode(note.video_time_seconds)}</strong>
                  <p>{note.content}</p>
                </article>
              ))}
            </div>
          </article>
          <article>
            <h3>字幕 ({result.transcripts.length})</h3>
            <div className="record-list">
              {result.transcripts.map((transcript) => (
                <article key={transcript.id} className="record-row">
                  <strong>{transcript.course_title} / {transcript.chapter_title} · {formatTimecode(transcript.start_seconds)}</strong>
                  <p>{transcript.text}</p>
                </article>
              ))}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}

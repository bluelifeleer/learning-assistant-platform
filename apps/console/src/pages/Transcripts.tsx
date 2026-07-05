import { useEffect, useState } from "react";
import { fetchTranscripts, type TranscriptItem } from "../api/client";

function formatSeconds(value?: number | null): string {
  if (value == null) return "--:--";
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function Transcripts() {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [message, setMessage] = useState("正在读取字幕...");

  useEffect(() => {
    void fetchTranscripts()
      .then((result) => {
        setItems(result.items);
        setMessage(result.items.length ? "" : "暂无字幕片段，播放页面采集后会显示在这里。");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "字幕读取失败"));
  }, []);

  return (
    <section className="panel">
      <h2>字幕</h2>
      {message ? <p>{message}</p> : null}
      <div className="record-list">
        {items.map((item) => (
          <article key={item.id} className="record-row">
            <strong>{item.course_title}</strong>
            <span>{item.chapter_title} · {formatSeconds(item.start_seconds)}</span>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

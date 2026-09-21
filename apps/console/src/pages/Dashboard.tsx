import { useEffect, useState } from "react";
import { fetchStatsSummary, type StatsSummary } from "../api/client";

export function Dashboard() {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [message, setMessage] = useState("正在读取统计...");

  useEffect(() => {
    void fetchStatsSummary()
      .then((result) => {
        setSummary(result);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "统计读取失败"));
  }, []);

  return (
    <section className="stacked-page">
      <article className="panel">
        <h2>总览</h2>
        {message ? <p>{message}</p> : null}
        {summary ? (
          <div className="stat-grid">
            <article className="stat-card"><span className="stat-label">课程</span><strong className="stat-value">{summary.courses}</strong></article>
            <article className="stat-card"><span className="stat-label">笔记</span><strong className="stat-value">{summary.notes}</strong></article>
            <article className="stat-card"><span className="stat-label">字幕</span><strong className="stat-value">{summary.transcripts}</strong></article>
            <article className="stat-card"><span className="stat-label">播放事件</span><strong className="stat-value">{summary.play_events}</strong></article>
          </div>
        ) : null}
      </article>
      <article className="panel">
        <h2>近 7 天活动</h2>
        {summary && summary.daily.length ? (
          <div className="data-table">
            <div><strong>日期</strong><strong>新增笔记</strong><strong>播放事件</strong></div>
            {summary.daily.map((day) => (
              <div key={day.date}>
                <span>{day.date}</span>
                <span>{day.notes}</span>
                <span>{day.play_events}</span>
              </div>
            ))}
          </div>
        ) : (
          <p>暂无近 7 天活动数据。</p>
        )}
      </article>
    </section>
  );
}

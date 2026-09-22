import { useEffect, useState } from "react";
import { fetchDueCards, fetchStatsSummary, type StatsSummary } from "../api/client";
import { buildRouteHash } from "../navSlug";

function navigate(hash: string) {
  if (typeof window !== "undefined") window.location.hash = hash;
}

function StatCard({ label, value, hash }: { label: string; value: number | string; hash: string }) {
  return (
    <button type="button" className="stat-card stat-card-link" onClick={() => navigate(hash)}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </button>
  );
}

export function Dashboard() {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [message, setMessage] = useState("正在读取统计...");

  useEffect(() => {
    void fetchStatsSummary()
      .then((result) => {
        setSummary(result);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "统计读取失败"));
    void fetchDueCards()
      .then((result) => setDueCount(result.items.length))
      .catch(() => setDueCount(null));
  }, []);

  return (
    <section className="stacked-page">
      <article className="panel">
        <h2>总览</h2>
        {message ? <p>{message}</p> : null}
        {summary ? (
          <div className="stat-grid">
            <StatCard label="课程" value={summary.courses} hash={buildRouteHash("课程")} />
            <StatCard label="笔记" value={summary.notes} hash={buildRouteHash("课程")} />
            <StatCard label="字幕" value={summary.transcripts} hash={buildRouteHash("课程")} />
            <StatCard label="播放事件" value={summary.play_events} hash={buildRouteHash("搜索")} />
            <StatCard label="今日待复习" value={dueCount ?? "-"} hash={buildRouteHash("复习")} />
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

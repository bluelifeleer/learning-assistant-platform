import { useEffect, useState } from "react";
import {
  fetchDueCards,
  fetchLearningProgress,
  fetchMastery,
  fetchStatsSummary,
  type LearningProgress,
  type MasteryItem,
  type StatsSummary,
} from "../api/client";
import { buildRouteHash } from "../navSlug";

function navigate(hash: string) {
  if (typeof window !== "undefined") window.location.hash = hash;
}

function masteryBarColor(accuracy: number): string {
  if (accuracy < 60) return "#e5534b";
  if (accuracy <= 85) return "#d4a72c";
  return "#2da44e";
}

function groupMasteryByCourse(items: MasteryItem[]): Array<{ course_id: string; course_title: string; chapters: MasteryItem[] }> {
  const groups: Array<{ course_id: string; course_title: string; chapters: MasteryItem[] }> = [];
  for (const item of items) {
    let group = groups.find((entry) => entry.course_id === item.course_id);
    if (!group) {
      group = { course_id: item.course_id, course_title: item.course_title, chapters: [] };
      groups.push(group);
    }
    group.chapters.push(item);
  }
  return groups;
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
  const [mastery, setMastery] = useState<MasteryItem[] | null>(null);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
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
    void fetchMastery()
      .then((result) => setMastery(result.items))
      .catch(() => setMastery(null));
    void fetchLearningProgress()
      .then((result) => setProgress(result))
      .catch(() => setProgress(null));
  }, []);

  return (
    <section className="stacked-page">
      <article className="panel">
        <h2>总览</h2>
        {message ? <p>{message}</p> : null}
        {summary ? (
          <div className="stat-grid">
            <StatCard label="课程" value={summary.courses} hash={buildRouteHash("课程")} />
            <StatCard label="笔记" value={summary.notes} hash={buildRouteHash("笔记")} />
            <StatCard label="字幕" value={summary.transcripts} hash={buildRouteHash("课程")} />
            <StatCard label="播放事件" value={summary.play_events} hash={buildRouteHash("搜索")} />
            <StatCard label="今日待复习" value={dueCount ?? "-"} hash={buildRouteHash("复习")} />
          </div>
        ) : null}
      </article>
      {progress ? (
        <article className="panel">
          <h2>学习进度</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">连续学习</span>
              <strong className="stat-value">{progress.streak_days} 天</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">本周学习</span>
              <strong className="stat-value">
                {progress.week_minutes}/{progress.weekly_goal_minutes} 分钟
              </strong>
              <span className="stat-progress-track">
                <span
                  className="stat-progress-fill"
                  style={{ width: `${Math.min(100, (progress.week_minutes / Math.max(1, progress.weekly_goal_minutes)) * 100)}%` }}
                />
              </span>
            </div>
          </div>
          {progress.continue_learning ? (
            <button
              type="button"
              className="continue-learning-card"
              onClick={() =>
                navigate(buildRouteHash("课程", { courseId: progress.continue_learning!.course_id, chapterId: progress.continue_learning!.chapter_id }))
              }
            >
              <span className="stat-label">继续学习</span>
              <strong>{progress.continue_learning.course_title} · {progress.continue_learning.chapter_title}</strong>
            </button>
          ) : null}
          {progress.courses.length ? (
            <div className="record-list">
              {progress.courses.map((course) => (
                <div key={course.course_id} className="record-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    type="button"
                    className="text-button"
                    style={{ flex: 1, textAlign: "left" }}
                    onClick={() => navigate(buildRouteHash("课程", { courseId: course.course_id }))}
                  >
                    {course.course_title}
                  </button>
                  <span style={{ whiteSpace: "nowrap" }}>已学 {course.studied_chapters}/{course.total_chapters} 章</span>
                  <span style={{ flex: 2, height: 8, borderRadius: 999, background: "rgba(127,127,127,0.25)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${Math.min(100, course.progress_pct)}%`, background: "var(--primary)" }} />
                  </span>
                  <span style={{ whiteSpace: "nowrap" }}>{Math.round(course.progress_pct)}%</span>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      ) : null}
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
      <article className="panel">
        <h2>学习掌握度</h2>
        {mastery && mastery.length ? (
          <div className="stacked-page">
            {groupMasteryByCourse(mastery).map((course) => (
              <article key={course.course_id}>
                <h3>{course.course_title}</h3>
                <div className="record-list">
                  {course.chapters.map((chapter) => (
                    <div key={chapter.chapter_id} className="record-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ flex: 1 }}>{chapter.chapter_title}</span>
                      <span style={{ whiteSpace: "nowrap" }}>
                        {chapter.correct}/{chapter.total} · {Math.round(chapter.accuracy)}%
                      </span>
                      <span style={{ flex: 2, height: 8, borderRadius: 999, background: "rgba(127,127,127,0.25)", overflow: "hidden" }}>
                        <span
                          style={{
                            display: "block",
                            height: "100%",
                            width: `${Math.min(100, Math.max(0, chapter.accuracy))}%`,
                            background: masteryBarColor(chapter.accuracy),
                          }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>完成测验后这里会显示掌握度。</p>
        )}
      </article>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { answerReviewCard, fetchCourses, fetchDueCards, type CourseItem, type ReviewAnswerResult, type ReviewCard } from "../api/client";
import { CourseChapterPicker, EMPTY_COURSE_CHAPTER_FILTER, useCourseChapters, type CourseChapterFilter } from "../components/CourseChapterPicker";
import { chapterAndDescendantIds } from "./courseTree";
import { advanceCard, createReviewSession, currentCard, revealAnswer, sessionFinished, type ReviewSessionState } from "./reviewDeck";

interface ReviewProps {
  token?: string;
}

export function Review({ token }: ReviewProps) {
  const [items, setItems] = useState<ReviewCard[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [filter, setFilter] = useState<CourseChapterFilter>(EMPTY_COURSE_CHAPTER_FILTER);
  const [session, setSession] = useState<ReviewSessionState | null>(null);
  const [message, setMessage] = useState("正在读取到期卡片...");
  const chapters = useCourseChapters(filter.courseId);

  useEffect(() => {
    void Promise.all([fetchDueCards(), fetchCourses()])
      .then(([cards, courseResult]) => {
        setItems(cards.items);
        setCourses(courseResult.items);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "到期卡片读取失败"));
  }, []);

  const filtered = useMemo(() => {
    const allowed = filter.sectionId
      ? new Set([filter.sectionId])
      : filter.chapterId
        ? chapterAndDescendantIds(chapters, filter.chapterId)
        : null;
    return items.filter((card) =>
      (!filter.courseId || card.course_id === filter.courseId)
      && (!allowed || (card.chapter_id != null && allowed.has(card.chapter_id))),
    );
  }, [items, filter, chapters]);

  useEffect(() => {
    setSession(filtered.length ? createReviewSession(filtered) : null);
  }, [filtered]);

  async function submitAnswer(result: ReviewAnswerResult) {
    const card = session ? currentCard(session) : null;
    if (!session || !card) return;
    try {
      await answerReviewCard(card.id, result, token);
      setSession(advanceCard(session));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "复习结果提交失败");
    }
  }

  const card = session ? currentCard(session) : null;
  const dueCount = session?.queue.length ?? 0;

  return (
    <section className="panel">
      <h2>复习</h2>
      <div style={{ marginBottom: 12 }}>
        <CourseChapterPicker courses={courses} value={filter} onChange={setFilter} />
      </div>
      {message ? <p>{message}</p> : null}
      {!message && items.length && !filtered.length ? <p>该范围暂无到期卡片。</p> : null}
      {session ? <p>今日到期：{dueCount} 张</p> : null}
      {session && !sessionFinished(session) && card ? (
        <article className="record-row">
          <p>{card.front}</p>
          {session.phase === "answer" ? <p>{card.back}</p> : null}
          <div className="inline-form">
            {session.phase === "question" ? (
              <button type="button" onClick={() => setSession(revealAnswer(session))}>显示答案</button>
            ) : (
              <>
                <button type="button" onClick={() => void submitAnswer("good")}>记得</button>
                <button type="button" onClick={() => void submitAnswer("again")}>忘了</button>
              </>
            )}
          </div>
        </article>
      ) : null}
      {session && sessionFinished(session) ? <p>今日复习已完成。</p> : null}
    </section>
  );
}

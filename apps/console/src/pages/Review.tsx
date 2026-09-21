import { useEffect, useState } from "react";
import { answerReviewCard, fetchDueCards, type ReviewAnswerResult } from "../api/client";
import { advanceCard, createReviewSession, currentCard, revealAnswer, sessionFinished, type ReviewSessionState } from "./reviewDeck";

interface ReviewProps {
  token?: string;
}

export function Review({ token }: ReviewProps) {
  const [session, setSession] = useState<ReviewSessionState | null>(null);
  const [message, setMessage] = useState("正在读取到期卡片...");

  useEffect(() => {
    void fetchDueCards()
      .then((result) => {
        setSession(createReviewSession(result.items));
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "到期卡片读取失败"));
  }, []);

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
      {message ? <p>{message}</p> : null}
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

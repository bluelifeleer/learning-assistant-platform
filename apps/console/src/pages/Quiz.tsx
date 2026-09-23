import { useEffect, useMemo, useRef, useState } from "react";
import { fetchCourses, fetchQuizQuestions, submitQuizAttempts, type CourseItem, type QuizQuestion } from "../api/client";
import { CourseChapterPicker, EMPTY_COURSE_CHAPTER_FILTER, useCourseChapters, type CourseChapterFilter } from "../components/CourseChapterPicker";
import { chapterAndDescendantIds, flattenChapters } from "./courseTree";
import {
  createQuizSession,
  currentQuestion,
  nextQuestion,
  scoreSummary,
  selectChoice,
  sessionFinished,
  submitAnswer,
  type QuizSessionState,
} from "./quizSession";

const TRUEFALSE_CHOICES = ["正确", "错误"];

interface QuizProps {
  token?: string;
}

function questionChoices(question: QuizQuestion): string[] {
  return question.question_type === "truefalse" ? TRUEFALSE_CHOICES : question.options;
}

export function Quiz({ token }: QuizProps) {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [filter, setFilter] = useState<CourseChapterFilter>(EMPTY_COURSE_CHAPTER_FILTER);
  const [session, setSession] = useState<QuizSessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const reportedRef = useRef(false);
  const chapters = useCourseChapters(filter.courseId);

  useEffect(() => {
    void fetchCourses()
      .then((result) => setCourses(result.items))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "课程列表读取失败"));
  }, []);

  const scopeChapterIds = useMemo(() => {
    if (filter.sectionId) return [filter.sectionId];
    if (filter.chapterId) return [...chapterAndDescendantIds(chapters, filter.chapterId)];
    if (filter.courseId) return flattenChapters(chapters).map(({ chapter }) => chapter.id);
    return [];
  }, [filter, chapters]);

  useEffect(() => {
    if (!session || !sessionFinished(session) || reportedRef.current || !session.attempts.length) return;
    reportedRef.current = true;
    void submitQuizAttempts(session.attempts, token).catch(() => {
      setReportMessage("答题记录上报失败，不影响本次成绩展示。");
    });
  }, [session, token]);

  async function startQuiz() {
    if (!scopeChapterIds.length) {
      setMessage("请先选择课程范围。");
      return;
    }
    setLoading(true);
    setMessage("");
    setReportMessage("");
    reportedRef.current = false;
    try {
      const results = await Promise.all(scopeChapterIds.map((chapterId) => fetchQuizQuestions(chapterId, token)));
      const seen = new Set<string>();
      const items = results.flatMap((result) => result.items).filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      if (!items.length) {
        setSession(null);
        setMessage("该范围暂无题目，请先在课程详情页使用 AI 出题。");
        return;
      }
      setSession(createQuizSession(items));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "题目读取失败");
    } finally {
      setLoading(false);
    }
  }

  const question = session ? currentQuestion(session) : null;
  const isLastQuestion = session !== null && session.index === session.questions.length - 1;

  return (
    <section className="panel">
      <h2>测验</h2>
      <div className="page-filter quiz-filter">
        <CourseChapterPicker courses={courses} value={filter} onChange={(next) => { setFilter(next); setSession(null); }} />
        <button type="button" className="primary-button" disabled={loading || !filter.courseId} onClick={() => void startQuiz()}>
          {loading ? "读取题目中..." : "开始测验"}
        </button>
      </div>
      {message ? <p>{message}</p> : null}
      {session && !sessionFinished(session) && question ? (
        <article className="record-row">
          <p>
            第 {session.index + 1} / {session.questions.length} 题{question.question_type === "truefalse" ? "（判断题）" : "（选择题）"}
          </p>
          <p><strong>{question.question}</strong></p>
          <div className="inline-form">
            {questionChoices(question).map((choice) => (
              <button
                key={choice}
                type="button"
                className="text-button"
                data-active={session.pendingChoice === choice ? "yes" : "no"}
                disabled={session.phase === "reviewed"}
                onClick={() => setSession(selectChoice(session, choice))}
              >
                {choice}
              </button>
            ))}
          </div>
          {session.phase === "reviewed" ? (
            <div>
              <p data-tone={session.answers[session.answers.length - 1]?.correct ? "ok" : "danger"}>
                {session.answers[session.answers.length - 1]?.correct ? "回答正确" : `回答错误，正确答案：${question.answer}`}
              </p>
              {question.explanation ? <p>解析:{question.explanation}</p> : null}
              <button type="button" className="primary-button" onClick={() => setSession(nextQuestion(session))}>
                {isLastQuestion ? "查看结果" : "下一题"}
              </button>
            </div>
          ) : (
            <button type="button" className="primary-button" disabled={session.pendingChoice === null} onClick={() => setSession(submitAnswer(session))}>
              提交答案
            </button>
          )}
        </article>
      ) : null}
      {session && sessionFinished(session) ? (
        <article className="record-row">
          <h3>测验结果</h3>
          <p>得分：{scoreSummary(session).correct} / {scoreSummary(session).total}</p>
          {scoreSummary(session).wrong.length ? (
            <div className="record-list">
              <h3>错题</h3>
              {scoreSummary(session).wrong.map((record) => (
                <article key={record.question.id} className="record-row">
                  <p><strong>{record.question.question}</strong></p>
                  <p>你的作答：{record.choice} · 正确答案：{record.question.answer}</p>
                  {record.question.explanation ? <p>解析:{record.question.explanation}</p> : null}
                </article>
              ))}
            </div>
          ) : <p>全部答对，没有错题。</p>}
          <div className="inline-form">
            <button type="button" onClick={() => { reportedRef.current = false; setReportMessage(""); setSession(createQuizSession(session.questions)); }}>重新测验</button>
            <button type="button" className="text-button" onClick={() => { reportedRef.current = false; setReportMessage(""); setSession(null); }}>重新选题</button>
          </div>
          {reportMessage ? <p style={{ fontSize: 12, opacity: 0.7 }}>{reportMessage}</p> : null}
        </article>
      ) : null}
    </section>
  );
}

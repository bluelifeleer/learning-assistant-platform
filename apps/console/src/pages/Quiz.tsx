import { useEffect, useMemo, useRef, useState } from "react";
import {
  bulkDeleteQuizQuestions,
  deleteQuizQuestion,
  fetchCourses,
  fetchQuizQuestions,
  submitQuizAttempts,
  updateQuizQuestion,
  type CourseItem,
  type QuizQuestion,
} from "../api/client";
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
  const [manageOpen, setManageOpen] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [managing, setManaging] = useState(false);
  const [manageMessage, setManageMessage] = useState("");
  const [editing, setEditing] = useState<{ id: string; question: string; answer: string; explanation: string } | null>(
    null,
  );
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

  async function loadQuestions(): Promise<QuizQuestion[]> {
    if (!scopeChapterIds.length) {
      setManageMessage("请先选择课程范围。");
      return [];
    }
    setManaging(true);
    setManageMessage("");
    try {
      const results = await Promise.all(scopeChapterIds.map((chapterId) => fetchQuizQuestions(chapterId, token)));
      const seen = new Set<string>();
      const items = results
        .flatMap((result) => result.items)
        .filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      setQuestions(items);
      setManageMessage(items.length ? `共 ${items.length} 道题` : "该范围暂无题目");
      return items;
    } catch (error) {
      setManageMessage(error instanceof Error ? error.message : "题目读取失败");
      return [];
    } finally {
      setManaging(false);
    }
  }

  async function toggleManage(): Promise<void> {
    if (manageOpen) {
      setManageOpen(false);
      setEditing(null);
      return;
    }
    setManageOpen(true);
    await loadQuestions();
  }

  async function saveEdit(): Promise<void> {
    if (!editing) return;
    setManaging(true);
    try {
      const updated = await updateQuizQuestion(
        editing.id,
        {
          question: editing.question,
          answer: editing.answer,
          explanation: editing.explanation.trim() ? editing.explanation : null,
        },
        token,
      );
      setQuestions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditing(null);
      setManageMessage("已保存");
    } catch (error) {
      setManageMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setManaging(false);
    }
  }

  async function removeQuestion(target: QuizQuestion): Promise<void> {
    if (!window.confirm(`删除这道题？\n\n${target.question}`)) return;
    setManaging(true);
    try {
      await deleteQuizQuestion(target.id, token);
      setQuestions((current) => current.filter((item) => item.id !== target.id));
      setManageMessage("已删除 1 道题");
    } catch (error) {
      setManageMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setManaging(false);
    }
  }

  async function clearScope(): Promise<void> {
    const ids = questions.map((item) => item.id);
    if (!ids.length) {
      setManageMessage("当前范围没有题目");
      return;
    }
    if (!window.confirm(`清空当前范围的 ${ids.length} 道题？此操作不可撤销。`)) return;
    setManaging(true);
    try {
      const result = await bulkDeleteQuizQuestions(ids, token);
      setQuestions([]);
      setManageMessage(`已清空 ${result.deleted} 道题`);
    } catch (error) {
      setManageMessage(error instanceof Error ? error.message : "清空失败");
    } finally {
      setManaging(false);
    }
  }

  return (
    <section className="panel">
      <h2>测验</h2>
      <div className="page-filter quiz-filter">
        <CourseChapterPicker courses={courses} value={filter} onChange={(next) => { setFilter(next); setSession(null); }} />
        <button type="button" className="primary-button" disabled={loading || !filter.courseId} onClick={() => void startQuiz()}>
          {loading ? "读取题目中..." : "开始测验"}
        </button>
        <button type="button" className="text-button" disabled={managing || !filter.courseId} onClick={() => void toggleManage()}>
          {manageOpen ? "收起题目管理" : "管理题目"}
        </button>
      </div>
      {message ? <p>{message}</p> : null}
      {manageOpen ? (
        <article className="record-row">
          <h3>题目管理</h3>
          {manageMessage ? <p>{manageMessage}</p> : null}
          {questions.length ? (
            <>
              <div className="inline-form">
                <button type="button" className="text-button" disabled={managing} onClick={() => void clearScope()}>
                  清空当前范围
                </button>
              </div>
              <div className="record-list">
                {questions.map((item, index) => (
                  <article key={item.id} className="record-row">
                    {editing?.id === item.id ? (
                      <div className="inline-form" style={{ flexDirection: "column", alignItems: "stretch" }}>
                        <label className="modal-field">
                          <span>题目</span>
                          <textarea
                            value={editing.question}
                            onChange={(event) => setEditing({ ...editing, question: event.target.value })}
                          />
                        </label>
                        <label className="modal-field">
                          <span>答案</span>
                          <input
                            value={editing.answer}
                            onChange={(event) => setEditing({ ...editing, answer: event.target.value })}
                          />
                        </label>
                        <label className="modal-field">
                          <span>解析</span>
                          <textarea
                            value={editing.explanation}
                            onChange={(event) => setEditing({ ...editing, explanation: event.target.value })}
                          />
                        </label>
                        <div className="inline-form">
                          <button type="button" className="primary-button" disabled={managing} onClick={() => void saveEdit()}>
                            保存
                          </button>
                          <button type="button" className="text-button" onClick={() => setEditing(null)}>
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p>
                          <strong>
                            {index + 1}. {item.question}
                          </strong>
                          {item.question_type === "truefalse" ? "（判断题）" : ""}
                        </p>
                        <p>
                          选项：{questionChoices(item).join(" / ")} · 答案：{item.answer}
                        </p>
                        {item.explanation ? <p>解析：{item.explanation}</p> : null}
                        <div className="inline-form">
                          <button
                            type="button"
                            className="text-button"
                            onClick={() =>
                              setEditing({
                                id: item.id,
                                question: item.question,
                                answer: item.answer,
                                explanation: item.explanation ?? "",
                              })
                            }
                          >
                            编辑
                          </button>
                          <button type="button" className="text-button" disabled={managing} onClick={() => void removeQuestion(item)}>
                            删除
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </article>
      ) : null}
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

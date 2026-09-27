import { useEffect, useMemo, useState } from "react";
import {
  answerReviewCard,
  deleteReviewCard,
  fetchCourses,
  fetchReviewCards,
  updateReviewCard,
  type CourseItem,
  type ReviewAnswerResult,
  type ReviewCard,
} from "../api/client";
import { CourseChapterPicker, EMPTY_COURSE_CHAPTER_FILTER, useCourseChapters, type CourseChapterFilter } from "../components/CourseChapterPicker";
import { ListToolbar, RowActions, ToolbarSearch, ToolbarSelect } from "../components/ListControls";
import { toast } from "../components/toast";
import { buildRouteHash } from "../navSlug";
import { matchesKeyword, sortItems } from "../listQuery";
import { chapterAndDescendantIds, flattenChapters } from "./courseTree";
import { advanceCard, createReviewSession, currentCard, revealAnswer, sessionFinished, type ReviewSessionState } from "./reviewDeck";

interface ReviewProps {
  token?: string;
}

const SCOPE_OPTIONS = [
  { value: "due", label: "今日待复习" },
  { value: "suspended", label: "已暂停" },
  { value: "all", label: "全部卡片" },
];

const SORT_OPTIONS = [
  { value: "due_asc", label: "到期时间" },
  { value: "created_desc", label: "最新创建" },
  { value: "reviews", label: "复习次数" },
];

function dueTimestamp(card: ReviewCard): number {
  return card.due_at ? new Date(card.due_at).getTime() : Number.POSITIVE_INFINITY;
}

function formatDue(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function Review({ token }: ReviewProps) {
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [filter, setFilter] = useState<CourseChapterFilter>(EMPTY_COURSE_CHAPTER_FILTER);
  const [scope, setScope] = useState("due");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("due_asc");
  const [session, setSession] = useState<ReviewSessionState | null>(null);
  const [message, setMessage] = useState("正在读取复习卡片...");
  const [busy, setBusy] = useState(false);
  const chapters = useCourseChapters(filter.courseId);

  useEffect(() => {
    void Promise.all([fetchReviewCards(), fetchCourses()])
      .then(([cardResult, courseResult]) => {
        setCards(cardResult.items);
        setCourses(courseResult.items);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "复习卡片读取失败"));
  }, []);

  const inScope = useMemo(() => {
    const now = Date.now();
    const allowed = filter.sectionId
      ? new Set([filter.sectionId])
      : filter.chapterId
        ? chapterAndDescendantIds(chapters, filter.chapterId)
        : null;
    return cards.filter((card) => {
      if (!filter.courseId || card.course_id !== filter.courseId) {
        if (filter.courseId) return false;
      }
      if (allowed && (card.chapter_id == null || !allowed.has(card.chapter_id))) return false;
      if (scope === "due" && (card.suspended || dueTimestamp(card) > now)) return false;
      if (scope === "suspended" && !card.suspended) return false;
      return matchesKeyword([card.front, card.back], keyword);
    });
  }, [cards, filter, chapters, keyword, scope]);

  const visible = useMemo(() => {
    switch (sort) {
      case "created_desc":
        return sortItems(inScope, (card) => card.created_at ?? "", "desc");
      case "reviews":
        return sortItems(inScope, (card) => card.review_count, "desc");
      default:
        return sortItems(inScope, (card) => dueTimestamp(card));
    }
  }, [inScope, sort]);

  // 复习流程只在「今日待复习」里跑;其余视图是管理用途
  useEffect(() => {
    setSession(scope === "due" && visible.length ? createReviewSession(visible) : null);
    // visible 每次筛选变化都会是新数组,这里就是想要的行为
  }, [visible, scope]);

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
  const cardCourse = card?.course_id ? courses.find((course) => course.id === card.course_id) : undefined;
  const cardChapters = useCourseChapters(card?.course_id ?? "");
  const cardChapterTitle = card?.chapter_id
    ? flattenChapters(cardChapters).find(({ chapter }) => chapter.id === card.chapter_id)?.chapter.title ?? null
    : null;

  function courseTitle(courseId?: string | null): string {
    if (!courseId) return "未知课程";
    return courses.find((course) => course.id === courseId)?.title ?? "未知课程";
  }

  function openCardSource(target: ReviewCard) {
    if (typeof window === "undefined" || !target.course_id) return;
    window.location.hash = buildRouteHash("课程", { courseId: target.course_id, chapterId: target.chapter_id });
  }

  function replaceCard(updated: ReviewCard) {
    setCards((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function toggleSuspended(target: ReviewCard): Promise<void> {
    setBusy(true);
    try {
      replaceCard(await updateReviewCard(target.id, { suspended: !target.suspended }, token));
      toast.success(target.suspended ? "已恢复卡片" : "已暂停卡片");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function reschedule(target: ReviewCard): Promise<void> {
    const current = target.due_at ? formatDue(target.due_at) : "";
    const input = window.prompt("到期日期(YYYY-MM-DD)", current);
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const parsed = new Date(`${trimmed}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      toast.error("日期格式不对,请用 YYYY-MM-DD");
      return;
    }
    setBusy(true);
    try {
      replaceCard(await updateReviewCard(target.id, { due_at: parsed.toISOString() }, token));
      toast.success(`已改到 ${trimmed} 到期`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "改期失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeCard(target: ReviewCard): Promise<void> {
    if (!window.confirm("删除这张卡片?复习记录会一并清除。")) return;
    setBusy(true);
    try {
      await deleteReviewCard(target.id, token);
      setCards((current) => current.filter((item) => item.id !== target.id));
      toast.success("已删除卡片");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>复习</h2>
      <ListToolbar count={visible.length} total={cards.length}>
        <ToolbarSearch value={keyword} onChange={setKeyword} placeholder="搜索卡片正面 / 背面内容" />
        <ToolbarSelect label="范围" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
        <ToolbarSelect label="排序" value={sort} onChange={setSort} options={SORT_OPTIONS} />
      </ListToolbar>
      <div className="page-filter">
        <CourseChapterPicker courses={courses} value={filter} onChange={setFilter} />
      </div>

      {message ? <p>{message}</p> : null}
      {session ? <p>今日到期:{dueCount} 张</p> : null}

      {session && !sessionFinished(session) && card ? (
        <article className="record-row">
          {card.course_id ? (
            <div>
              <button type="button" className="text-button text-button-sm" onClick={() => openCardSource(card)}>
                来源:{cardCourse?.title ?? "未知课程"}{cardChapterTitle ? ` / ${cardChapterTitle}` : ""} ›
              </button>
            </div>
          ) : null}
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

      {!message && !visible.length ? (
        <div className="empty-state">
          <strong>{cards.length ? "该范围没有卡片" : "还没有复习卡片"}</strong>
          <span>{cards.length ? "换个范围或清掉筛选条件试试" : "在笔记里点「加入复习」即可生成卡片"}</span>
        </div>
      ) : null}

      {visible.length ? (
        <div className="record-list" style={{ marginTop: 14 }}>
          {visible.map((item) => (
            <article key={item.id} className="record-row">
              <div className="note-row-head">
                <button type="button" className="text-button text-button-sm" onClick={() => openCardSource(item)}>
                  {courseTitle(item.course_id)} ›
                </button>
                <span className="progress-meta">
                  {item.suspended ? "已暂停" : `${formatDue(item.due_at)} 到期`} · 复习 {item.review_count} 次
                </span>
                <RowActions>
                  <button type="button" className="text-button-sm" disabled={busy} onClick={() => void toggleSuspended(item)}>
                    {item.suspended ? "恢复" : "暂停"}
                  </button>
                  <button type="button" className="text-button-sm" disabled={busy} onClick={() => void reschedule(item)}>改期</button>
                  <button type="button" className="text-button-sm danger-text" disabled={busy} onClick={() => void removeCard(item)}>删除</button>
                </RowActions>
              </div>
              <p>{item.front}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

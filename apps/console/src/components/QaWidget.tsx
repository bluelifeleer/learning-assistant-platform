import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ApiError, askCourseQuestion } from "../api/client";
import { aiActionErrorMessage, AI_NOT_CONFIGURED_MESSAGE, isNotConfiguredError } from "../pages/aiTasks";
import { formatTimecode } from "../pages/courseTree";
import { NoteMarkdown } from "../pages/NoteMarkdown";
import { appendAssistantMessage, appendUserMessage, buildHistory, trimQuestion, type QaMessage } from "../pages/qaChat";
import { goToSettings, toast } from "./toast";
import {
  clampWidgetPosition,
  defaultWidgetPosition,
  widgetSize,
  type WidgetPosition,
} from "./qaWidgetDrag";

const QA_NO_TRANSCRIPT_MESSAGE = "该范围还没有字幕，请先在学习页播放并采集字幕";

const QA_SUGGESTIONS = ["这节课讲了哪些重点？", "帮我总结当前章节的内容", "有哪些容易混淆的概念？"];

interface QaWidgetProps {
  courseId: string;
  selectedChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
}

export function QaWidget({ courseId, selectedChapterId, onSelectChapter }: QaWidgetProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<WidgetPosition | null>(null);
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [input, setInput] = useState("");
  const [chapterOnly, setChapterOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  function currentSize() {
    return widgetSize(expanded, window.innerWidth, window.innerHeight);
  }

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, busy, open]);

  // 视口尺寸变化时把窗口拉回可见范围
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      setPosition((current) => {
        if (!current) return current;
        const size = currentSize();
        return clampWidgetPosition(current.x, current.y, size.width, size.height, window.innerWidth, window.innerHeight);
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expanded]);

  function openWidget() {
    const size = currentSize();
    setPosition((current) => current ?? defaultWidgetPosition(size.width, size.height, window.innerWidth, window.innerHeight));
    setOpen(true);
  }

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    const size = widgetSize(next, window.innerWidth, window.innerHeight);
    setPosition((current) =>
      current ? clampWidgetPosition(current.x, current.y, size.width, size.height, window.innerWidth, window.innerHeight) : current,
    );
  }

  function handleHeaderPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    if (position === null) return;
    event.preventDefault();
    const size = currentSize();
    const drag = { startX: event.clientX, startY: event.clientY, origin: position };
    const onMove = (moveEvent: PointerEvent) => {
      setPosition(
        clampWidgetPosition(
          drag.origin.x + moveEvent.clientX - drag.startX,
          drag.origin.y + moveEvent.clientY - drag.startY,
          size.width,
          size.height,
          window.innerWidth,
          window.innerHeight,
        ),
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function send() {
    const question = trimQuestion(input);
    if (!question || busy) return;
    setBusy(true);
    setMessages(appendUserMessage(messages, question));
    setInput("");
    try {
      const answer = await askCourseQuestion({
        course_id: courseId,
        chapter_id: chapterOnly ? selectedChapterId : null,
        question,
        history: buildHistory(messages),
      });
      setMessages((current) => appendAssistantMessage(current, answer));
    } catch (askError) {
      if (askError instanceof ApiError && askError.status === 422) {
        toast.info(QA_NO_TRANSCRIPT_MESSAGE);
      } else if (isNotConfiguredError(askError)) {
        toast.error(AI_NOT_CONFIGURED_MESSAGE, {
          action: { label: "去配置", onClick: () => goToSettings("general") },
        });
      } else {
        toast.error(aiActionErrorMessage(askError, "提问失败，请稍后重试"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open ? null : (
        <button type="button" className="qa-launcher" aria-label="打开课程问答" title="课程问答" onClick={openWidget}>
          问答
        </button>
      )}
      {open && position ? (
        <div
          className="qa-widget"
          role="dialog"
          aria-label="课程问答"
          style={{ left: position.x, top: position.y, width: currentSize().width, height: currentSize().height }}
        >
          <div className="qa-widget-header" onPointerDown={handleHeaderPointerDown}>
            <h3>课程问答</h3>
            <button
              type="button"
              className="qa-widget-close"
              aria-label={expanded ? "还原问答窗口" : "扩大问答窗口"}
              title={expanded ? "还原" : "扩大"}
              onClick={toggleExpanded}
            >
              {expanded ? "⤡" : "⤢"}
            </button>
            <button type="button" className="qa-widget-close" aria-label="关闭问答" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <div className="qa-widget-body">
            <div className="qa-messages" ref={messagesRef}>
              {messages.length ? messages.map((message, index) => (
                <div key={index} className={`qa-message ${message.role}`}>
                  <div className="qa-bubble">
                    {message.role === "assistant" ? <NoteMarkdown content={message.content} /> : <p>{message.content}</p>}
                  </div>
                  {message.citations?.length ? (
                    <div className="qa-citations">
                      {message.citations.map((citation, citationIndex) => (
                        <button
                          key={citationIndex}
                          type="button"
                          className="note-tag"
                          title={citation.excerpt}
                          onClick={() => onSelectChapter(citation.chapter_id)}
                        >
                          {citation.chapter_title} {formatTimecode(citation.start_seconds)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )) : (
                <div className="qa-empty">
                  <p>就这门课的字幕内容提问，回答会附上可跳转的章节引用。</p>
                  <div className="qa-suggestions">
                    {QA_SUGGESTIONS.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => setInput(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {busy ? (
                <div className="qa-message assistant">
                  <div className="qa-bubble">
                    <span className="qa-typing" aria-label="思考中"><i /><i /><i /></span>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="qa-input-row">
              <input
                type="text"
                value={input}
                placeholder="输入问题，Enter 发送"
                disabled={busy}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <label className="qa-chapter-only">
                <input
                  type="checkbox"
                  checked={chapterOnly && Boolean(selectedChapterId)}
                  disabled={!selectedChapterId || busy}
                  onChange={(event) => setChapterOnly(event.target.checked)}
                />
                仅当前章节
              </label>
              <button type="button" className="primary-button" disabled={busy || !trimQuestion(input)} onClick={() => void send()}>
                {busy ? "思考中..." : "发送"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

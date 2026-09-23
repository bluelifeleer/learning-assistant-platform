import { describe, expect, it } from "vitest";
import {
  appendAssistantMessage,
  appendUserMessage,
  buildHistory,
  trimQuestion,
  QA_HISTORY_LIMIT,
  QA_QUESTION_MAX_LENGTH,
  type QaMessage,
} from "./qaChat";

describe("qaChat message management", () => {
  it("appends a user message without mutating the original list", () => {
    const messages: QaMessage[] = [];
    const next = appendUserMessage(messages, "什么是递归?");

    expect(messages).toHaveLength(0);
    expect(next).toEqual([{ role: "user", content: "什么是递归?" }]);
  });

  it("appends an assistant message with citations", () => {
    const messages: QaMessage[] = [{ role: "user", content: "q" }];
    const citations = [{ chapter_id: "ch-1", chapter_title: "第一章", start_seconds: 65, excerpt: "..." }];
    const next = appendAssistantMessage(messages, { answer_md: "回答内容", citations });

    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ role: "assistant", content: "回答内容", citations });
  });

  it("builds history without citations and keeps only the most recent messages", () => {
    const messages: QaMessage[] = Array.from({ length: QA_HISTORY_LIMIT + 2 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `msg-${index}`,
      citations: [{ chapter_id: "ch-1", chapter_title: "t", start_seconds: null, excerpt: "e" }],
    }));

    const history = buildHistory(messages);

    expect(history).toHaveLength(QA_HISTORY_LIMIT);
    expect(history[0]).toEqual({ role: "user", content: "msg-2" });
    expect(history[history.length - 1]).toEqual({ role: "assistant", content: `msg-${QA_HISTORY_LIMIT + 1}` });
    history.forEach((item) => expect(Object.keys(item).sort()).toEqual(["content", "role"]));
  });

  it("trims surrounding whitespace from the question", () => {
    expect(trimQuestion("  什么是递归?  \n")).toBe("什么是递归?");
  });

  it("returns null for an empty or whitespace-only question", () => {
    expect(trimQuestion("")).toBeNull();
    expect(trimQuestion("   \n\t ")).toBeNull();
  });

  it("truncates questions longer than the max length", () => {
    const long = "很".repeat(QA_QUESTION_MAX_LENGTH + 100);
    const trimmed = trimQuestion(long);

    expect(trimmed).not.toBeNull();
    expect(trimmed).toHaveLength(QA_QUESTION_MAX_LENGTH);
  });
});

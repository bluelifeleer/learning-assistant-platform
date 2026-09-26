import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "../api/client";
import {
  createQuizSession,
  currentQuestion,
  isCorrectAnswer,
  nextQuestion,
  scoreSummary,
  selectChoice,
  sessionFinished,
  submitAnswer,
} from "./quizSession";

function question(id: string, overrides: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    id,
    course_id: "course-1",
    chapter_id: "chapter-1",
    question_type: "choice",
    question: `问题 ${id}`,
    options: ["甲", "乙", "丙", "丁"],
    answer: "乙",
    explanation: `解析 ${id}`,
    ...overrides,
  };
}

describe("isCorrectAnswer", () => {
  it("matches the exact option text", () => {
    expect(isCorrectAnswer(question("1"), "乙")).toBe(true);
    expect(isCorrectAnswer(question("1"), "甲")).toBe(false);
  });

  it("supports letter answers against option order", () => {
    const q = question("1", { answer: "B" });
    expect(isCorrectAnswer(q, "乙")).toBe(true);
    expect(isCorrectAnswer(q, "甲")).toBe(false);
  });

  it("normalizes true/false aliases for truefalse questions", () => {
    const q = question("1", { question_type: "truefalse", options: [], answer: "正确" });
    expect(isCorrectAnswer(q, "正确")).toBe(true);
    expect(isCorrectAnswer(q, "true")).toBe(true);
    expect(isCorrectAnswer(q, "错误")).toBe(false);
    const qFalse = question("1", { question_type: "truefalse", options: [], answer: "false" });
    expect(isCorrectAnswer(qFalse, "错误")).toBe(true);
    expect(isCorrectAnswer(qFalse, "正确")).toBe(false);
  });

  it("rejects empty or mismatched answers", () => {
    expect(isCorrectAnswer(question("1", { answer: "" }), "乙")).toBe(false);
    expect(isCorrectAnswer(question("1"), "")).toBe(false);
  });
});

describe("quizSession", () => {
  it("starts on the first question in the answering phase", () => {
    const session = createQuizSession([question("1"), question("2")]);

    expect(currentQuestion(session)?.id).toBe("1");
    expect(session.phase).toBe("answering");
    expect(sessionFinished(session)).toBe(false);
    expect(scoreSummary(session)).toMatchObject({ total: 2, answered: 0, correct: 0 });
  });

  it("treats an empty quiz as already finished", () => {
    const session = createQuizSession([]);

    expect(sessionFinished(session)).toBe(true);
    expect(currentQuestion(session)).toBeNull();
  });

  it("does not submit without a selected choice", () => {
    const session = submitAnswer(createQuizSession([question("1")]));

    expect(session.phase).toBe("answering");
    expect(session.answers).toHaveLength(0);
  });

  it("judges the submitted answer and records it", () => {
    const right = submitAnswer(selectChoice(createQuizSession([question("1")]), "乙"));
    expect(right.phase).toBe("reviewed");
    expect(right.answers[0]).toMatchObject({ choice: "乙", correct: true });

    const wrong = submitAnswer(selectChoice(createQuizSession([question("1")]), "甲"));
    expect(wrong.answers[0]).toMatchObject({ choice: "甲", correct: false });
  });

  it("locks the choice after submission", () => {
    const reviewed = submitAnswer(selectChoice(createQuizSession([question("1")]), "甲"));
    const changed = selectChoice(reviewed, "乙");

    expect(changed.pendingChoice).toBe("甲");
    expect(submitAnswer(reviewed).answers).toHaveLength(1);
  });

  it("advances to the next question and resets the phase", () => {
    const session = nextQuestion(submitAnswer(selectChoice(createQuizSession([question("1"), question("2")]), "乙")));

    expect(currentQuestion(session)?.id).toBe("2");
    expect(session.phase).toBe("answering");
    expect(session.pendingChoice).toBeNull();
  });

  it("cannot advance before submitting", () => {
    const session = selectChoice(createQuizSession([question("1"), question("2")]), "乙");

    expect(nextQuestion(session).index).toBe(0);
  });

  it("finishes after the last question and reports the score with wrong items", () => {
    let session = createQuizSession([question("1"), question("2"), question("3")]);
    session = nextQuestion(submitAnswer(selectChoice(session, "乙")));
    session = nextQuestion(submitAnswer(selectChoice(session, "甲")));
    session = nextQuestion(submitAnswer(selectChoice(session, "丙")));

    expect(sessionFinished(session)).toBe(true);
    const summary = scoreSummary(session);
    expect(summary).toMatchObject({ total: 3, answered: 3, correct: 1 });
    expect(summary.wrong.map((record) => record.question.id)).toEqual(["2", "3"]);
  });

  it("accumulates attempts with question_id and chosen on each submission", () => {
    let session = createQuizSession([question("1"), question("2")]);
    session = nextQuestion(submitAnswer(selectChoice(session, "乙")));
    session = nextQuestion(submitAnswer(selectChoice(session, "甲")));

    expect(session.attempts).toEqual([
      { question_id: "1", chosen: "乙" },
      { question_id: "2", chosen: "甲" },
    ]);
  });

  it("does not record an attempt without a submitted choice", () => {
    const session = submitAnswer(createQuizSession([question("1")]));

    expect(session.attempts).toHaveLength(0);
  });

  it("does not duplicate attempts when submitting again after review", () => {
    const reviewed = submitAnswer(selectChoice(createQuizSession([question("1")]), "甲"));
    const again = submitAnswer(reviewed);

    expect(again.attempts).toHaveLength(1);
  });

  it("resets attempts for a new session", () => {
    const finished = submitAnswer(selectChoice(createQuizSession([question("1")]), "乙"));
    const fresh = createQuizSession(finished.questions);

    expect(fresh.attempts).toHaveLength(0);
  });
});

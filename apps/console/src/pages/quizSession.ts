import type { QuizAttemptItem, QuizQuestion } from "../api/client";

export type QuizPhase = "answering" | "reviewed";

export interface QuizAnswerRecord {
  question: QuizQuestion;
  choice: string;
  correct: boolean;
}

export interface QuizSessionState {
  questions: QuizQuestion[];
  index: number;
  phase: QuizPhase;
  pendingChoice: string | null;
  answers: QuizAnswerRecord[];
  attempts: QuizAttemptItem[];
}

const TRUE_ALIASES = new Set(["true", "正确", "对", "yes", "t"]);
const FALSE_ALIASES = new Set(["false", "错误", "错", "no", "f"]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function isCorrectAnswer(question: QuizQuestion, choice: string): boolean {
  const expected = normalize(question.answer);
  const given = normalize(choice);
  if (!expected || !given) return false;
  if (expected === given) return true;
  if (TRUE_ALIASES.has(expected) && TRUE_ALIASES.has(given)) return true;
  if (FALSE_ALIASES.has(expected) && FALSE_ALIASES.has(given)) return true;
  // 兼容答案为选项字母(如 "A"/"b")而选项为完整文本的情况
  if (/^[a-z]$/.test(expected)) {
    const optionIndex = expected.charCodeAt(0) - "a".charCodeAt(0);
    const option = question.options[optionIndex];
    if (option !== undefined && normalize(option) === given) return true;
  }
  return false;
}

export function createQuizSession(questions: QuizQuestion[]): QuizSessionState {
  return { questions, index: 0, phase: "answering", pendingChoice: null, answers: [], attempts: [] };
}

export function currentQuestion(state: QuizSessionState): QuizQuestion | null {
  return state.questions[state.index] ?? null;
}

export function sessionFinished(state: QuizSessionState): boolean {
  return state.questions.length === 0 || state.index >= state.questions.length;
}

export function selectChoice(state: QuizSessionState, choice: string): QuizSessionState {
  if (sessionFinished(state) || state.phase !== "answering") return state;
  return { ...state, pendingChoice: choice };
}

export function submitAnswer(state: QuizSessionState): QuizSessionState {
  if (state.phase !== "answering") return state;
  const question = currentQuestion(state);
  if (!question || state.pendingChoice === null) return state;
  const record: QuizAnswerRecord = {
    question,
    choice: state.pendingChoice,
    correct: isCorrectAnswer(question, state.pendingChoice),
  };
  // 判分由服务端完成,这里只提交作答,不再上送客户端的 correct 结论
  const attempt: QuizAttemptItem = { question_id: question.id, chosen: state.pendingChoice };
  return { ...state, phase: "reviewed", answers: [...state.answers, record], attempts: [...state.attempts, attempt] };
}

export function nextQuestion(state: QuizSessionState): QuizSessionState {
  if (state.phase !== "reviewed") return state;
  return { ...state, index: state.index + 1, phase: "answering", pendingChoice: null };
}

export interface QuizScoreSummary {
  total: number;
  answered: number;
  correct: number;
  wrong: QuizAnswerRecord[];
}

export function scoreSummary(state: QuizSessionState): QuizScoreSummary {
  const correct = state.answers.filter((record) => record.correct).length;
  return {
    total: state.questions.length,
    answered: state.answers.length,
    correct,
    wrong: state.answers.filter((record) => !record.correct),
  };
}

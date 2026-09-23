import type { AskAnswer, AskCitation, AskHistoryMessage } from "../api/client";

export const QA_HISTORY_LIMIT = 6;
export const QA_QUESTION_MAX_LENGTH = 2000;

export interface QaMessage {
  role: "user" | "assistant";
  content: string;
  citations?: AskCitation[];
}

export function appendUserMessage(messages: QaMessage[], question: string): QaMessage[] {
  return [...messages, { role: "user", content: question }];
}

export function appendAssistantMessage(messages: QaMessage[], answer: AskAnswer): QaMessage[] {
  return [...messages, { role: "assistant", content: answer.answer_md, citations: answer.citations }];
}

export function buildHistory(messages: QaMessage[]): AskHistoryMessage[] {
  return messages.slice(-QA_HISTORY_LIMIT).map(({ role, content }) => ({ role, content }));
}

export function trimQuestion(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, QA_QUESTION_MAX_LENGTH);
}

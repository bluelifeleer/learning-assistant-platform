import type { ReviewCard } from "../api/client";

export type ReviewPhase = "question" | "answer";

export interface ReviewSessionState {
  queue: ReviewCard[];
  index: number;
  phase: ReviewPhase;
}

export function createReviewSession(cards: ReviewCard[]): ReviewSessionState {
  return { queue: cards, index: 0, phase: "question" };
}

export function currentCard(state: ReviewSessionState): ReviewCard | null {
  return state.queue[state.index] ?? null;
}

export function revealAnswer(state: ReviewSessionState): ReviewSessionState {
  if (!currentCard(state)) return state;
  return { ...state, phase: "answer" };
}

export function advanceCard(state: ReviewSessionState): ReviewSessionState {
  if (!currentCard(state)) return state;
  return { ...state, index: state.index + 1, phase: "question" };
}

export function sessionFinished(state: ReviewSessionState): boolean {
  return state.queue.length === 0 || state.index >= state.queue.length;
}

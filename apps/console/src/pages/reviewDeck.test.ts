import { describe, expect, it } from "vitest";
import type { ReviewCard } from "../api/client";
import { advanceCard, createReviewSession, currentCard, revealAnswer, sessionFinished } from "./reviewDeck";

function card(id: string): ReviewCard {
  return { id, front: `front-${id}`, back: `back-${id}`, due_at: null, review_count: 0 };
}

describe("reviewDeck", () => {
  it("starts on the question phase of the first card", () => {
    const session = createReviewSession([card("1"), card("2")]);

    expect(currentCard(session)?.id).toBe("1");
    expect(session.phase).toBe("question");
    expect(sessionFinished(session)).toBe(false);
  });

  it("reveals the answer without advancing", () => {
    const session = revealAnswer(createReviewSession([card("1")]));

    expect(session.phase).toBe("answer");
    expect(currentCard(session)?.id).toBe("1");
  });

  it("advances to the next card and resets to the question phase", () => {
    const session = advanceCard(revealAnswer(createReviewSession([card("1"), card("2")])));

    expect(currentCard(session)?.id).toBe("2");
    expect(session.phase).toBe("question");
  });

  it("finishes after the last card is answered", () => {
    const session = advanceCard(createReviewSession([card("1")]));

    expect(sessionFinished(session)).toBe(true);
    expect(currentCard(session)).toBeNull();
  });

  it("treats an empty queue as already finished", () => {
    const session = createReviewSession([]);

    expect(sessionFinished(session)).toBe(true);
    expect(currentCard(session)).toBeNull();
  });
});

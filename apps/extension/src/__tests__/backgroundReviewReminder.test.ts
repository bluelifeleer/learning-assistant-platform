import { afterEach, describe, expect, it, vi } from "vitest";
import { localDayKey, notifyDueReviewCards, reviewNotification } from "../backgroundReviewReminder";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("review reminder", () => {
  it("uses local date for the once-per-day guard", () => {
    expect(localDayKey(new Date(2026, 10, 1, 23, 59))).toBe("2026-11-01");
    expect(localDayKey(new Date(2026, 0, 9, 0, 0))).toBe("2026-01-09");
  });

  it("builds a readable due-card notification", () => {
    expect(reviewNotification(12)).toEqual({
      title: "学习助手 · 今日复习",
      message: "有 12 张复习卡到期，点开学习助手控制台开始复习。",
    });
  });

  it("notifies at most once per day when due cards exist", async () => {
    const store: Record<string, unknown> = {
      apiBaseUrl: "http://127.0.0.1:17890/api/v1",
      apiToken: "la_token",
      enabledAdapters: ["wencai-school"],
    };
    const create = vi.fn().mockResolvedValue("notification-id");
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string | string[]) => {
            if (Array.isArray(key)) return Object.fromEntries(key.map((item) => [item, store[item]]));
            return { [key]: store[key] };
          }),
          set: vi.fn(async (values: Record<string, unknown>) => {
            Object.assign(store, values);
          }),
        },
      },
      notifications: { create },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ due: 5 }),
    }));

    await notifyDueReviewCards();
    await notifyDueReviewCards();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith("learning-assistant-review-due", expect.objectContaining({
      message: "有 5 张复习卡到期，点开学习助手控制台开始复习。",
    }));
  });
});

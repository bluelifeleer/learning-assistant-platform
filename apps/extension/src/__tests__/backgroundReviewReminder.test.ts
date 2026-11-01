import { afterEach, describe, expect, it, vi } from "vitest";
import {
  localDayKey,
  nextReminderTime,
  notifyDueReviewCards,
  registerReviewReminder,
  REVIEW_REMINDER_ALARM,
  reviewNotification,
  scheduleReviewReminder,
} from "../backgroundReviewReminder";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("review reminder", () => {
  it("uses local date for the once-per-day guard", () => {
    expect(localDayKey(new Date(2026, 10, 1, 23, 59))).toBe("2026-11-01");
    expect(localDayKey(new Date(2026, 0, 9, 0, 0))).toBe("2026-01-09");
  });

  it("schedules the next local reminder time", () => {
    const morning = new Date(2026, 10, 1, 8, 0);
    const evening = new Date(2026, 10, 1, 10, 0);

    expect(nextReminderTime(morning, "09:00")).toEqual(new Date(2026, 10, 1, 9, 0));
    expect(nextReminderTime(evening, "09:00")).toEqual(new Date(2026, 10, 2, 9, 0));
    expect(nextReminderTime(evening, "bad")).toEqual(new Date(2026, 10, 2, 9, 0));
  });

  it("reschedules the alarm at the configured time", async () => {
    const store: Record<string, unknown> = {
      apiBaseUrl: "http://127.0.0.1:17890/api/v1",
      apiToken: "la_token",
      enabledAdapters: [],
      reviewReminderEnabled: true,
      reviewReminderTime: "09:30",
    };
    const create = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string | string[]) => {
            if (Array.isArray(key)) return Object.fromEntries(key.map((item) => [item, store[item]]));
            return { [key]: store[key] };
          }),
        },
      },
      alarms: { create, clear },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 1, 8, 0));

    await scheduleReviewReminder();

    expect(clear).toHaveBeenCalledWith(REVIEW_REMINDER_ALARM);
    expect(create).toHaveBeenCalledWith(
      REVIEW_REMINDER_ALARM,
      { when: new Date(2026, 10, 1, 9, 30).getTime() },
    );
    vi.useRealTimers();
  });

  it("builds a readable due-card notification", () => {
    expect(reviewNotification(12)).toEqual({
      title: "学习助手 · 今日复习",
      message: "有 12 张复习卡到期，点开学习助手控制台开始复习。",
    });
  });

  it("opens the console when the review notification is clicked", async () => {
    const store: Record<string, unknown> = {
      apiBaseUrl: "http://127.0.0.1:17890/api/v1",
      apiToken: "la_token",
      enabledAdapters: [],
    };
    let onClicked: ((id: string) => void) | undefined;
    const tabsCreate = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string | string[]) => {
            if (Array.isArray(key)) return Object.fromEntries(key.map((item) => [item, store[item]]));
            return { [key]: store[key] };
          }),
          set: vi.fn(),
        },
      },
      alarms: {
        get: vi.fn((_name: string, callback: (alarm?: unknown) => void) => callback({ name: REVIEW_REMINDER_ALARM })),
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() },
      },
      notifications: {
        create: vi.fn(),
        clear,
        onClicked: { addListener: vi.fn((handler) => { onClicked = handler; }) },
      },
      tabs: { create: tabsCreate },
    });

    registerReviewReminder();
    onClicked?.("learning-assistant-review-due");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(tabsCreate).toHaveBeenCalledWith({ url: "http://127.0.0.1:17891" });
    expect(clear).toHaveBeenCalledWith("learning-assistant-review-due");
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

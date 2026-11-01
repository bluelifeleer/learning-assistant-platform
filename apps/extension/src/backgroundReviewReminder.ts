import { isValidApiBaseUrl, loadExtensionConfig } from "./config";

export const REVIEW_REMINDER_ALARM = "learning-assistant-review-reminder";
const LAST_NOTIFIED_KEY = "learning-assistant:last-review-notified";
const NOTIFICATION_ID = "learning-assistant-review-due";

/** 本地日期(YYYY-MM-DD),用来保证一天只提醒一次。 */
export function localDayKey(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function reviewNotification(due: number): { title: string; message: string } {
  return {
    title: "学习助手 · 今日复习",
    message: `有 ${due} 张复习卡到期，点开学习助手控制台开始复习。`,
  };
}

/** 每小时查一次到期数；同一天最多提醒一次。 */
export async function notifyDueReviewCards(): Promise<void> {
  const config = await loadExtensionConfig();
  if (!config.apiToken || !isValidApiBaseUrl(config.apiBaseUrl)) return;
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/capture/due-count`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiToken}`,
      },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return;
  }
  if (!response.ok) return;
  const body = (await response.json()) as { due?: unknown };
  const due = typeof body.due === "number" ? body.due : 0;
  if (due <= 0) return;

  const today = localDayKey();
  const stored = await chrome.storage.local.get(LAST_NOTIFIED_KEY);
  if (stored[LAST_NOTIFIED_KEY] === today) return;

  const { title, message } = reviewNotification(due);
  try {
    await chrome.notifications.create(NOTIFICATION_ID, {
      type: "basic",
      iconUrl: "assets/icon-128.png",
      title,
      message,
    });
    await chrome.storage.local.set({ [LAST_NOTIFIED_KEY]: today });
  } catch {
    // 用户禁用通知权限时静默跳过，不影响其他采集功能
  }
}

export function registerReviewReminder(): void {
  // service worker 每次唤醒都会执行这里；先 get 再 create，
  // 否则每分钟心跳唤醒时重建 alarm 会把 60 分钟周期不断重置。
  chrome.alarms.get(REVIEW_REMINDER_ALARM, (existing) => {
    if (!existing) {
      chrome.alarms.create(REVIEW_REMINDER_ALARM, { delayInMinutes: 1, periodInMinutes: 60 });
    }
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== REVIEW_REMINDER_ALARM) return;
    void notifyDueReviewCards();
  });
}

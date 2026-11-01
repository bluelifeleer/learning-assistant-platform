import { isValidApiBaseUrl, loadExtensionConfig, normalizeReminderTime } from "./config";
import { consoleUrlFromApiBaseUrl } from "./noteCapture";

export const REVIEW_REMINDER_ALARM = "learning-assistant-review-reminder";
const LAST_NOTIFIED_KEY = "learning-assistant:last-review-notified";
const NOTIFICATION_ID = "learning-assistant-review-due";

/** 本地日期(YYYY-MM-DD),用来保证一天只提醒一次。 */
export function localDayKey(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 下一次本地 HH:mm；今天已过则排到明天。 */
export function nextReminderTime(now: Date, time: string): Date {
  const [hours, minutes] = normalizeReminderTime(time).split(":").map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
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

/** 按用户设置的时间重排下一次提醒；关闭时清掉 alarm。 */
export async function scheduleReviewReminder(): Promise<void> {
  const config = await loadExtensionConfig();
  await chrome.alarms.clear(REVIEW_REMINDER_ALARM);
  if (config.reviewReminderEnabled === false) return;
  const next = nextReminderTime(new Date(), config.reviewReminderTime ?? "09:00");
  await chrome.alarms.create(REVIEW_REMINDER_ALARM, { when: next.getTime() });
}

export function registerReviewReminder(): void {
  // service worker 每次唤醒都会执行这里；只在没有 alarm 时补建，
  // 避免每分钟心跳把用户的提醒时间不断重置。
  chrome.alarms.get(REVIEW_REMINDER_ALARM, (existing) => {
    if (!existing) void scheduleReviewReminder();
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== REVIEW_REMINDER_ALARM) return;
    void (async () => {
      const config = await loadExtensionConfig();
      if (config.reviewReminderEnabled !== false) await notifyDueReviewCards();
      // 一次性 alarm，触发后重新排到下一个本地时间
      await scheduleReviewReminder();
    })();
  });
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId !== NOTIFICATION_ID) return;
    void (async () => {
      try {
        const config = await loadExtensionConfig();
        await chrome.tabs.create({ url: consoleUrlFromApiBaseUrl(config.apiBaseUrl) });
        await chrome.notifications.clear(notificationId);
      } catch {
        // 配置非法/浏览器拒绝打开时静默
      }
    })();
  });
}

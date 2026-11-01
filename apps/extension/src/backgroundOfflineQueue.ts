import { loadExtensionConfig } from "./config";
import { flushOfflineQueue } from "./offlineQueue";

export const OFFLINE_QUEUE_ALARM = "learning-assistant-offline-queue";

async function flush(): Promise<void> {
  const config = await loadExtensionConfig();
  if (!config.apiToken || !config.apiBaseUrl) return;
  await flushOfflineQueue({ apiBaseUrl: config.apiBaseUrl, apiToken: config.apiToken }).catch(() => 0);
}

export function registerOfflineQueueFlush(): void {
  chrome.alarms.get(OFFLINE_QUEUE_ALARM, (existing) => {
    if (!existing) {
      chrome.alarms.create(OFFLINE_QUEUE_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
    }
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== OFFLINE_QUEUE_ALARM) return;
    void flush();
  });
  // service worker 启动时也补一次，页面关闭后队列不会一直躺着
  void flush();
}

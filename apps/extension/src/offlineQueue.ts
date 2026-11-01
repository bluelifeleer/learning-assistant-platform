import { isValidApiBaseUrl } from "./config";

export type OfflineCaptureKind = "note" | "screenshot";

export interface OfflineCapture {
  id: string;
  kind: OfflineCaptureKind;
  path: string;
  body: Record<string, unknown>;
  addToReview?: boolean;
  createdAt: number;
  size: number;
}

export const OFFLINE_QUEUE_KEY = "learning-assistant:offline-captures";
const MAX_ENTRIES = 20;
const MAX_ENTRY_BYTES = 3 * 1024 * 1024;

function makeId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

async function readQueue(): Promise<OfflineCapture[]> {
  const stored = await chrome.storage.local.get(OFFLINE_QUEUE_KEY);
  const value = stored[OFFLINE_QUEUE_KEY];
  return Array.isArray(value) ? value as OfflineCapture[] : [];
}

async function writeQueue(queue: OfflineCapture[]): Promise<void> {
  await chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: queue.slice(-MAX_ENTRIES) });
}

/** 网络失败时把采集请求存进本地队列;超过 3MB 的截图不入队,避免撑爆 storage 配额。 */
export async function enqueueOfflineCapture(
  kind: OfflineCaptureKind,
  path: string,
  body: Record<string, unknown>,
  addToReview = false,
): Promise<boolean> {
  const size = JSON.stringify(body).length;
  if (size > MAX_ENTRY_BYTES) return false;
  const queue = await readQueue();
  queue.push({ id: makeId(), kind, path, body, addToReview, createdAt: Date.now(), size });
  await writeQueue(queue);
  return true;
}

/** 依次补传队列;成功的删除,4xx(除 401)说明请求本身有问题,也删除避免永久卡住。 */
export async function flushOfflineQueue(config: { apiBaseUrl: string; apiToken: string }): Promise<number> {
  if (!config.apiToken || !isValidApiBaseUrl(config.apiBaseUrl)) return 0;
  const queue = await readQueue();
  if (queue.length === 0) return 0;
  const remaining: OfflineCapture[] = [];
  let flushed = 0;
  for (const entry of queue) {
    let response: Response;
    try {
      response = await fetch(`${config.apiBaseUrl}${entry.path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiToken}`,
        },
        body: JSON.stringify(entry.body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      remaining.push(entry);
      continue;
    }
    if (response.ok) {
      flushed += 1;
      if (entry.kind === "note" && entry.addToReview) {
        try {
          const note = (await response.json()) as { note_id?: string };
          if (note.note_id) {
            await fetch(`${config.apiBaseUrl}/capture/review-card`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${config.apiToken}`,
              },
              body: JSON.stringify({ note_id: note.note_id }),
              signal: AbortSignal.timeout(15_000),
            });
          }
        } catch {
          // 笔记已经补传成功;复习卡失败不回滚,避免重复笔记
        }
      }
      continue;
    }
    if (response.status >= 400 && response.status < 500 && response.status !== 401) {
      continue;
    }
    remaining.push(entry);
  }
  await writeQueue(remaining);
  return flushed;
}

export async function pendingOfflineCount(): Promise<number> {
  return (await readQueue()).length;
}

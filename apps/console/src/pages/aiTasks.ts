import { ApiError, fetchAiTask, type AITask } from "../api/client";

export const AI_TASK_POLL_INTERVAL_MS = 2000;

export const AI_NOT_CONFIGURED_MESSAGE = "请先在设置页配置 AI（系统设置 → 设置 → AI 设置）";

export interface AiTaskPollingCallbacks {
  onSettled: (task: AITask) => void;
  onError?: (error: unknown) => void;
}

export function isNotConfiguredError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400;
}

export function isAiNotConfiguredError(error: unknown): boolean {
  return isNotConfiguredError(error);
}

export function aiActionErrorMessage(error: unknown, fallback: string): string {
  if (isAiNotConfiguredError(error)) return AI_NOT_CONFIGURED_MESSAGE;
  return error instanceof Error ? error.message : fallback;
}

export function startAiTaskPolling(taskId: string, callbacks: AiTaskPollingCallbacks, intervalMs = AI_TASK_POLL_INTERVAL_MS): () => void {
  let stopped = false;
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;

  async function tick() {
    if (stopped) return;
    try {
      const task = await fetchAiTask(taskId);
      if (stopped) return;
      if (task.status === "done" || task.status === "failed") {
        stopped = true;
        callbacks.onSettled(task);
        return;
      }
    } catch (error) {
      if (stopped) return;
      stopped = true;
      callbacks.onError?.(error);
      return;
    }
    timer = globalThis.setTimeout(() => void tick(), intervalMs);
  }

  void tick();

  return () => {
    stopped = true;
    if (timer !== undefined) globalThis.clearTimeout(timer);
  };
}

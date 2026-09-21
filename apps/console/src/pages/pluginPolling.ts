export const PLUGIN_STATUS_REFRESH_MS = 5000;

export function startPluginStatusPolling(refresh: (signal: AbortSignal) => void | Promise<void>, intervalMs = PLUGIN_STATUS_REFRESH_MS): () => void {
  let stopped = false;
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let controller = new AbortController();

  async function tick() {
    if (stopped) return;
    controller = new AbortController();
    try {
      await refresh(controller.signal);
    } catch {
      // 刷新失败由调用方在 UI 上呈现，轮询继续
    }
    if (!stopped) {
      timer = globalThis.setTimeout(() => void tick(), intervalMs);
    }
  }

  void tick();

  return () => {
    stopped = true;
    controller.abort();
    if (timer !== undefined) globalThis.clearTimeout(timer);
  };
}

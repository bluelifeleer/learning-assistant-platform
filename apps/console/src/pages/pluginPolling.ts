export const PLUGIN_STATUS_REFRESH_MS = 5000;

export function startPluginStatusPolling(refresh: () => void, intervalMs = PLUGIN_STATUS_REFRESH_MS): () => void {
  refresh();
  const timer = globalThis.setInterval(refresh, intervalMs);
  return () => globalThis.clearInterval(timer);
}

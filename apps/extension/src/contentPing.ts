export const CONTENT_SCRIPT_PING_MESSAGE = "learning-assistant:ping";

// 供后台 service worker 探测本页 content script 是否存活;
// 扩展 reload 后旧脚本上下文失效不会响应,后台据此重新注入
export function registerContentScriptPing(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (message && typeof message === "object" && (message as { type?: unknown }).type === CONTENT_SCRIPT_PING_MESSAGE) {
      sendResponse({ ok: true });
    }
    return undefined;
  });
}

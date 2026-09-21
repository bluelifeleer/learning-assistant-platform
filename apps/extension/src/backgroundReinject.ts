import { CONTENT_SCRIPT_PING_MESSAGE } from "./contentPing";

const CONSOLE_URL_PREFIXES = ["http://127.0.0.1:17891/", "http://localhost:17891/"];

export interface ReinjectTabsLike {
  query(queryInfo: { url: string[] }): Promise<Array<{ id?: number; url?: string }>>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

export interface ReinjectScriptingLike {
  executeScript(injection: { target: { tabId: number; allFrames: boolean }; files: string[] }): Promise<unknown>;
}

export function isConsoleUrl(url: string): boolean {
  return CONSOLE_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export async function reinjectMissingContentScripts(
  tabs: ReinjectTabsLike,
  scripting: ReinjectScriptingLike,
): Promise<number> {
  const targets = await tabs.query({ url: ["http://*/*", "https://*/*"] });
  let injected = 0;
  for (const tab of targets) {
    if (tab.id === undefined || !tab.url || isConsoleUrl(tab.url)) continue;
    const alive = await tabs.sendMessage(tab.id, { type: CONTENT_SCRIPT_PING_MESSAGE })
      .then(() => true)
      .catch(() => false);
    if (alive) continue;
    try {
      await scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["dist/content.js"] });
      injected += 1;
    } catch {
      // chrome://、应用商店等禁止注入的页面直接跳过
    }
  }
  return injected;
}

// service worker 每次启动(含手动 reload 扩展)都会执行顶层代码:
// 对存活的页面无影响,对失效页面自动补注 content script,用户无需手动刷新学习页面
export function registerContentScriptReinjection(): void {
  void reinjectMissingContentScripts(chrome.tabs, chrome.scripting).catch(() => undefined);
}

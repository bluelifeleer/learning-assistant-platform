export interface ExtensionConfig {
  apiBaseUrl: string;
  apiToken: string;
  enabledAdapters: string[];
}

export const DEFAULT_EXTENSION_CONFIG: ExtensionConfig = {
  apiBaseUrl: "http://127.0.0.1:17890/api/v1",
  apiToken: "",
  enabledAdapters: ["wencai-school", "generic-dom-course", "generic-video"],
};

const LOCAL_API_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function isValidApiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && LOCAL_API_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeExtensionConfig(value: Partial<ExtensionConfig> | null | undefined): ExtensionConfig {
  const rawApiBaseUrl = value?.apiBaseUrl?.trim() ?? "";
  return {
    // 只有"从未配置过"(空值)才落到默认地址。存了一个非法地址时原样保留,
    // 由调用方判定并停止上报 —— 否则会悄悄把 token 发到用户没配置过的 host。
    apiBaseUrl: rawApiBaseUrl === "" ? DEFAULT_EXTENSION_CONFIG.apiBaseUrl : rawApiBaseUrl,
    apiToken: value?.apiToken?.trim() || "",
    // 用 Array.isArray 而不是 .length:空数组是"全部关闭"的明确选择,不能被默认值覆盖
    enabledAdapters: Array.isArray(value?.enabledAdapters)
      ? value.enabledAdapters.filter((item): item is string => typeof item === "string")
      : DEFAULT_EXTENSION_CONFIG.enabledAdapters,
  };
}

export async function loadExtensionConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get(["apiBaseUrl", "apiToken", "enabledAdapters"]);
  return normalizeExtensionConfig(stored as Partial<ExtensionConfig>);
}

export async function saveExtensionConfig(config: ExtensionConfig): Promise<void> {
  const apiBaseUrl = config.apiBaseUrl.trim();
  if (!isValidApiBaseUrl(apiBaseUrl)) {
    throw new Error("API 地址必须以 https:// 开头，或使用本地开发地址(http://127.0.0.1、http://localhost、http://[::1])");
  }
  await chrome.storage.local.set(normalizeExtensionConfig({ ...config, apiBaseUrl }));
}

export async function ensureDefaultExtensionConfig(): Promise<void> {
  const stored = await chrome.storage.local.get(["apiBaseUrl", "enabledAdapters"]) as Partial<ExtensionConfig>;
  const defaults: Partial<ExtensionConfig> = {};
  if (typeof stored.apiBaseUrl !== "string" || !stored.apiBaseUrl.trim()) {
    defaults.apiBaseUrl = DEFAULT_EXTENSION_CONFIG.apiBaseUrl;
  }
  // 只在"从未设置过"时补默认值:空数组表示用户明确关闭了全部适配器,
  // 每次 service worker 启动都重新塞回默认值会把用户的关闭操作吃掉
  if (!Array.isArray(stored.enabledAdapters)) {
    defaults.enabledAdapters = DEFAULT_EXTENSION_CONFIG.enabledAdapters;
  }
  if (Object.keys(defaults).length > 0) {
    await chrome.storage.local.set(defaults);
  }
}

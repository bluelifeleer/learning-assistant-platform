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
  const apiBaseUrl = value?.apiBaseUrl?.trim() || "";
  return {
    apiBaseUrl: isValidApiBaseUrl(apiBaseUrl) ? apiBaseUrl : DEFAULT_EXTENSION_CONFIG.apiBaseUrl,
    apiToken: value?.apiToken?.trim() || "",
    enabledAdapters: value?.enabledAdapters?.length ? value.enabledAdapters : DEFAULT_EXTENSION_CONFIG.enabledAdapters,
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
  if (!Array.isArray(stored.enabledAdapters) || stored.enabledAdapters.length === 0) {
    defaults.enabledAdapters = DEFAULT_EXTENSION_CONFIG.enabledAdapters;
  }
  if (Object.keys(defaults).length > 0) {
    await chrome.storage.local.set(defaults);
  }
}

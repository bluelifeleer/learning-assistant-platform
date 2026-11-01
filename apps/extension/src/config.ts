export interface CustomAdapterConfig {
  id: string;
  name: string;
  /** 域名，例如 learn.example.com；匹配该域名及其子域名 */
  domain: string;
  /** 课程标题选择器 */
  courseSelector: string;
  /** 章节列表选择器 */
  chapterSelector: string;
  /** 章节 id 所在属性，默认 data-id */
  chapterIdAttribute?: string;
  /** 当前章节选择器，可选；不填取第一个章节 */
  currentChapterSelector?: string;
  /** 字幕选择器，可选 */
  transcriptSelector?: string;
  /** 视频选择器，默认 video */
  videoSelector?: string;
  enabled?: boolean;
}

export interface ExtensionConfig {
  apiBaseUrl: string;
  apiToken: string;
  enabledAdapters: string[];
  customAdapters: CustomAdapterConfig[];
  /** 通用文章/文档页笔记：在没有命中学习 adapter 的页面上也挂浮层 */
  articleCapture?: boolean;
  /** 完全不注入/采集的域名 */
  pausedSites?: string[];
  /** 隐私模式：禁用截图存证 */
  privacyMode?: boolean;
  /** 到期复习提醒开关 */
  reviewReminderEnabled?: boolean;
  /** 本地提醒时间 HH:mm */
  reviewReminderTime?: string;
}

export const DEFAULT_EXTENSION_CONFIG: ExtensionConfig = {
  apiBaseUrl: "http://127.0.0.1:17890/api/v1",
  apiToken: "",
  enabledAdapters: ["wencai-school", "generic-dom-course", "generic-video"],
  customAdapters: [],
  articleCapture: false,
  pausedSites: [],
  privacyMode: false,
  reviewReminderEnabled: true,
  reviewReminderTime: "09:00",
};

const LOCAL_API_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);
const MAX_CUSTOM_ADAPTERS = 20;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

export function normalizeDomain(value: unknown): string {
  const raw = cleanText(value, 200).toLowerCase();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname;
  } catch {
    return "";
  }
}

/** 只保留字段完整、域名合法的自定义 adapter；坏数据不能拖垮整个配置。 */
export function normalizeCustomAdapters(value: unknown): CustomAdapterConfig[] {
  if (!Array.isArray(value)) return [];
  const result: CustomAdapterConfig[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<CustomAdapterConfig>;
    const id = cleanText(raw.id, 80);
    const name = cleanText(raw.name, 60);
    const domain = normalizeDomain(raw.domain);
    const courseSelector = cleanText(raw.courseSelector, 200);
    const chapterSelector = cleanText(raw.chapterSelector, 200);
    if (!id || !name || !domain || !courseSelector || !chapterSelector) continue;
    result.push({
      id,
      name,
      domain,
      courseSelector,
      chapterSelector,
      chapterIdAttribute: cleanText(raw.chapterIdAttribute, 80) || "data-id",
      currentChapterSelector: cleanText(raw.currentChapterSelector, 200) || undefined,
      transcriptSelector: cleanText(raw.transcriptSelector, 200) || undefined,
      videoSelector: cleanText(raw.videoSelector, 200) || "video",
      enabled: raw.enabled !== false,
    });
    if (result.length >= MAX_CUSTOM_ADAPTERS) break;
  }
  return result;
}

export function normalizeReminderTime(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  return match ? `${match[1]}:${match[2]}` : "09:00";
}

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
    customAdapters: normalizeCustomAdapters(value?.customAdapters),
    articleCapture: value?.articleCapture === true,
    pausedSites: Array.isArray(value?.pausedSites)
      ? Array.from(new Set(value.pausedSites.map((item) => normalizeDomain(item)).filter(Boolean))).slice(0, 50)
      : [],
    privacyMode: value?.privacyMode === true,
    reviewReminderEnabled: value?.reviewReminderEnabled !== false,
    reviewReminderTime: normalizeReminderTime(value?.reviewReminderTime),
  };
}

export async function loadExtensionConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get(["apiBaseUrl", "apiToken", "enabledAdapters", "customAdapters", "articleCapture", "pausedSites", "privacyMode", "reviewReminderEnabled", "reviewReminderTime"]);
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
  const stored = await chrome.storage.local.get(["apiBaseUrl", "enabledAdapters", "customAdapters", "articleCapture", "pausedSites", "privacyMode", "reviewReminderEnabled", "reviewReminderTime"]) as Partial<ExtensionConfig>;
  const defaults: Partial<ExtensionConfig> = {};
  if (typeof stored.apiBaseUrl !== "string" || !stored.apiBaseUrl.trim()) {
    defaults.apiBaseUrl = DEFAULT_EXTENSION_CONFIG.apiBaseUrl;
  }
  // 只在"从未设置过"时补默认值:空数组表示用户明确关闭了全部适配器,
  // 每次 service worker 启动都重新塞回默认值会把用户的关闭操作吃掉
  if (!Array.isArray(stored.enabledAdapters)) {
    defaults.enabledAdapters = DEFAULT_EXTENSION_CONFIG.enabledAdapters;
  }
  if (!Array.isArray(stored.customAdapters)) {
    defaults.customAdapters = DEFAULT_EXTENSION_CONFIG.customAdapters;
  }
  if (typeof stored.articleCapture !== "boolean") {
    defaults.articleCapture = DEFAULT_EXTENSION_CONFIG.articleCapture;
  }
  if (!Array.isArray(stored.pausedSites)) {
    defaults.pausedSites = DEFAULT_EXTENSION_CONFIG.pausedSites;
  }
  if (typeof stored.privacyMode !== "boolean") {
    defaults.privacyMode = DEFAULT_EXTENSION_CONFIG.privacyMode;
  }
  if (typeof stored.reviewReminderEnabled !== "boolean") {
    defaults.reviewReminderEnabled = DEFAULT_EXTENSION_CONFIG.reviewReminderEnabled;
  }
  if (typeof stored.reviewReminderTime !== "string") {
    defaults.reviewReminderTime = DEFAULT_EXTENSION_CONFIG.reviewReminderTime;
  }
  if (Object.keys(defaults).length > 0) {
    await chrome.storage.local.set(defaults);
  }
}

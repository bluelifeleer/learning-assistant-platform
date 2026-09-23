export const navItems = ["总览", "课程", "复习", "测验", "搜索", "系统设置"] as const;
export type ConsolePage = (typeof navItems)[number];

export const settingsTabs = ["general", "plugins", "adapters", "users"] as const;
export type SettingsTab = (typeof settingsTabs)[number];

const PAGE_TO_SLUG: Record<ConsolePage, string> = {
  总览: "dashboard",
  课程: "courses",
  复习: "review",
  测验: "quiz",
  搜索: "search",
  系统设置: "settings",
};

const SLUG_TO_PAGE: Record<string, ConsolePage> = Object.fromEntries(
  navItems.map((page) => [PAGE_TO_SLUG[page], page]),
);

export interface RouteState {
  page: ConsolePage;
  courseId: string | null;
  chapterId: string | null;
  settingsTab: SettingsTab | null;
}

export interface RouteOptions {
  courseId?: string | null;
  chapterId?: string | null;
  settingsTab?: SettingsTab | null;
}

export function buildRouteHash(page: ConsolePage, options: RouteOptions = {}): string {
  const slug = PAGE_TO_SLUG[page];
  if (page === "课程" && options.courseId) {
    const base = `#/${slug}/${encodeURIComponent(options.courseId)}`;
    return options.chapterId ? `${base}/ch/${encodeURIComponent(options.chapterId)}` : base;
  }
  if (page === "系统设置" && options.settingsTab) {
    return `#/${slug}/${options.settingsTab}`;
  }
  return `#/${slug}`;
}

export function parseRouteHash(hash: string): RouteState {
  const fallback: RouteState = { page: "总览", courseId: null, chapterId: null, settingsTab: null };
  const segments = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const page = SLUG_TO_PAGE[segments[0] ?? ""];
  if (!page) return fallback;
  if (page === "课程") {
    const courseId = segments[1] ? decodeURIComponent(segments[1]) : null;
    const chapterId = segments[2] === "ch" && segments[3] ? decodeURIComponent(segments[3]) : null;
    return { page, courseId, chapterId, settingsTab: null };
  }
  if (page === "系统设置") {
    const tab = segments[1] as SettingsTab | undefined;
    return { page, courseId: null, chapterId: null, settingsTab: tab && (settingsTabs as readonly string[]).includes(tab) ? tab : null };
  }
  return { page, courseId: null, chapterId: null, settingsTab: null };
}

export const navItems = ["总览", "课程", "字幕", "笔记", "搜索", "复习", "导出", "插件管理", "站点适配器", "用户与授权", "设置"] as const;
export type ConsolePage = (typeof navItems)[number];

const PAGE_TO_SLUG: Record<ConsolePage, string> = {
  总览: "dashboard",
  课程: "courses",
  字幕: "transcripts",
  笔记: "notes",
  搜索: "search",
  复习: "review",
  导出: "exports",
  插件管理: "plugins",
  站点适配器: "adapters",
  用户与授权: "users",
  设置: "settings",
};

const SLUG_TO_PAGE: Record<string, ConsolePage> = Object.fromEntries(
  navItems.map((page) => [PAGE_TO_SLUG[page], page]),
);

export interface RouteState {
  page: ConsolePage;
  courseId: string | null;
}

export function buildRouteHash(page: ConsolePage, courseId?: string | null): string {
  const slug = PAGE_TO_SLUG[page];
  return courseId ? `#/${slug}/${encodeURIComponent(courseId)}` : `#/${slug}`;
}

export function parseRouteHash(hash: string): RouteState {
  const fallback: RouteState = { page: "总览", courseId: null };
  const segments = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const page = SLUG_TO_PAGE[segments[0] ?? ""];
  if (!page) return fallback;
  const courseId = page === "课程" && segments[1] ? decodeURIComponent(segments[1]) : null;
  return { page, courseId };
}

import { describe, expect, it } from "vitest";
import { buildRouteHash, navItems, parseRouteHash } from "./navSlug";

describe("nav slug mapping", () => {
  it("maps the six navigation items to unique slugs", () => {
    const hashes = navItems.map((page) => buildRouteHash(page));
    expect(new Set(hashes).size).toBe(navItems.length);
    expect(navItems).toEqual(["总览", "课程", "笔记", "复习", "测验", "搜索", "系统设置"]);
    expect(buildRouteHash("总览")).toBe("#/dashboard");
    expect(buildRouteHash("课程")).toBe("#/courses");
    expect(buildRouteHash("复习")).toBe("#/review");
    expect(buildRouteHash("测验")).toBe("#/quiz");
    expect(buildRouteHash("搜索")).toBe("#/search");
    expect(buildRouteHash("系统设置")).toBe("#/settings");
  });

  it("embeds course and chapter ids in course detail hashes", () => {
    expect(buildRouteHash("课程", { courseId: "course-1" })).toBe("#/courses/course-1");
    expect(buildRouteHash("课程", { courseId: "course-1", chapterId: "ch-9" })).toBe("#/courses/course-1/ch/ch-9");
    expect(buildRouteHash("课程", { courseId: "课程 A" })).toBe(`#/courses/${encodeURIComponent("课程 A")}`);
  });

  it("supports settings sub-tab hashes", () => {
    expect(buildRouteHash("系统设置", { settingsTab: "plugins" })).toBe("#/settings/plugins");
    expect(buildRouteHash("系统设置", { settingsTab: "adapters" })).toBe("#/settings/adapters");
    expect(parseRouteHash("#/settings/users")).toEqual({ page: "系统设置", courseId: null, chapterId: null, settingsTab: "users" });
  });

  it("round-trips through parseRouteHash", () => {
    expect(parseRouteHash("#/courses/course-1")).toEqual({ page: "课程", courseId: "course-1", chapterId: null, settingsTab: null });
    expect(parseRouteHash("#/courses/course-1/ch/ch-9")).toEqual({ page: "课程", courseId: "course-1", chapterId: "ch-9", settingsTab: null });
    expect(parseRouteHash("#/search")).toEqual({ page: "搜索", courseId: null, chapterId: null, settingsTab: null });
  });

  it("falls back to the dashboard for empty or invalid hashes", () => {
    const fallback = { page: "总览", courseId: null, chapterId: null, settingsTab: null };
    expect(parseRouteHash("")).toEqual(fallback);
    expect(parseRouteHash("#")).toEqual(fallback);
    expect(parseRouteHash("#/no-such-page")).toEqual(fallback);
  });

  it("does not crash on malformed percent-encoding in course hash", () => {
    expect(parseRouteHash("#/courses/%E0%A4%A")).toEqual({
      page: "课程",
      courseId: null,
      chapterId: null,
      settingsTab: null,
    });
  });

  it("ignores invalid settings tabs and foreign sub-paths", () => {
    expect(parseRouteHash("#/settings/nope").settingsTab).toBeNull();
    expect(parseRouteHash("#/notes/whatever").page).toBe("笔记");
    expect(parseRouteHash("#/legacy/whatever").page).toBe("总览");
    expect(parseRouteHash(`#/courses/${encodeURIComponent("课程 A")}/ch/${encodeURIComponent("第一章")}`)).toEqual({
      page: "课程",
      courseId: "课程 A",
      chapterId: "第一章",
      settingsTab: null,
    });
  });
});

import { describe, expect, it } from "vitest";
import { buildRouteHash, navItems, parseRouteHash } from "./navSlug";

describe("nav slug mapping", () => {
  it("maps every navigation item to a unique slug", () => {
    const hashes = navItems.map((page) => buildRouteHash(page));
    expect(new Set(hashes).size).toBe(navItems.length);
    expect(buildRouteHash("总览")).toBe("#/dashboard");
    expect(buildRouteHash("课程")).toBe("#/courses");
    expect(buildRouteHash("插件管理")).toBe("#/plugins");
    expect(buildRouteHash("用户与授权")).toBe("#/users");
  });

  it("embeds the course id in the course detail hash", () => {
    expect(buildRouteHash("课程", "course-1")).toBe("#/courses/course-1");
    expect(buildRouteHash("课程", "课程 A")).toBe(`#/courses/${encodeURIComponent("课程 A")}`);
  });

  it("round-trips through parseRouteHash", () => {
    expect(parseRouteHash("#/courses/course-1")).toEqual({ page: "课程", courseId: "course-1" });
    expect(parseRouteHash("#/plugins")).toEqual({ page: "插件管理", courseId: null });
    expect(parseRouteHash("#/search")).toEqual({ page: "搜索", courseId: null });
  });

  it("falls back to the dashboard for empty or invalid hashes", () => {
    expect(parseRouteHash("")).toEqual({ page: "总览", courseId: null });
    expect(parseRouteHash("#")).toEqual({ page: "总览", courseId: null });
    expect(parseRouteHash("#/no-such-page")).toEqual({ page: "总览", courseId: null });
  });

  it("ignores course ids on non-course pages and decodes uri components", () => {
    expect(parseRouteHash("#/notes/whatever")).toEqual({ page: "笔记", courseId: null });
    expect(parseRouteHash(`#/courses/${encodeURIComponent("课程 A")}`)).toEqual({ page: "课程", courseId: "课程 A" });
  });
});

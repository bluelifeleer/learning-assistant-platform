import { afterEach, describe, expect, it, vi } from "vitest";
import { genericArticleAdapter } from "../adapters/genericArticle";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generic article adapter", () => {
  it("uses the article title and h2/h3 headings as chapters", () => {
    vi.stubGlobal("location", new URL("https://docs.example.com/guide/intro"));
    const document_ = {
      title: "浏览器标签标题",
      querySelector: (selector: string) => (selector === "article h1, main h1, h1" ? { textContent: " 入门指南 " } : null),
      querySelectorAll: () => [
        { id: "install", textContent: "安装", children: [] },
        { id: "", textContent: " 配置 ", children: [] },
      ],
    } as unknown as Document;

    const course = genericArticleAdapter.extractCourse(document_);

    expect(course?.title).toBe("入门指南");
    expect(course?.externalCourseId).toBe("article:https://docs.example.com/guide/intro");
    expect(course?.chapters).toEqual([
      { externalChapterId: "install", title: "安装", sortOrder: 1, children: [] },
      { externalChapterId: "article-heading-2", title: "配置", sortOrder: 2, children: [] },
    ]);
  });

  it("has no video or transcript on a text page", () => {
    expect(genericArticleAdapter.findVideo({} as Document)).toBeNull();
    expect(genericArticleAdapter.extractTranscript({} as Document)).toBeNull();
    expect(genericArticleAdapter.matches(new URL("https://docs.example.com/a"))).toBe(true);
    expect(genericArticleAdapter.matches(new URL("ftp://docs.example.com/a"))).toBe(false);
  });
});

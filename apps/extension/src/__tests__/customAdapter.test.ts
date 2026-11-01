import { afterEach, describe, expect, it, vi } from "vitest";
import { createCustomAdapter } from "../adapters/customAdapter";
import { pickAdapter } from "../adapters/registry";
import { normalizeCustomAdapters, type CustomAdapterConfig } from "../config";

const config: CustomAdapterConfig = {
  id: "custom-acme",
  name: "Acme 学堂",
  domain: "learn.acme.test",
  courseSelector: "h1.course-title",
  chapterSelector: ".chapter-list li",
  chapterIdAttribute: "data-chapter",
  currentChapterSelector: ".chapter-list li.active",
  transcriptSelector: ".subtitle-line",
};

function fakeDocument(): Document {
  const chapters = [
    { textContent: "第一章 导论", getAttribute: (name: string) => (name === "data-chapter" ? "c1" : null), id: "" },
    { textContent: "第二章 进阶", getAttribute: (name: string) => (name === "data-chapter" ? "c2" : null), id: "" },
  ];
  const current = { textContent: "第一章 导论", getAttribute: () => "c1", id: "" };
  const subtitle = { textContent: "自定义站点的字幕" };
  return {
    title: "Acme 课程页",
    querySelector: (selector: string) => {
      if (selector === "h1.course-title") return { textContent: "供应链管理" };
      if (selector === ".chapter-list li.active") return current;
      if (selector === ".subtitle-line") return subtitle;
      return null;
    },
    querySelectorAll: (selector: string) => (selector === ".chapter-list li" ? chapters : []),
  } as unknown as Document;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("custom adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches the configured domain and subdomains", () => {
    const adapter = createCustomAdapter(config);

    expect(adapter.matches(new URL("https://learn.acme.test/course/1"))).toBe(true);
    expect(adapter.matches(new URL("https://v2.learn.acme.test/course/1"))).toBe(true);
    expect(adapter.matches(new URL("https://other.test/course/1"))).toBe(false);
  });

  it("extracts course, chapters, current chapter and subtitle through selectors", () => {
    vi.stubGlobal("location", new URL("https://learn.acme.test/course/1?x=1#c1"));
    const adapter = createCustomAdapter(config);
    const document_ = fakeDocument();

    expect(adapter.extractCourse(document_)).toEqual({
      externalCourseId: "custom:custom-acme:https://learn.acme.test/course/1",
      title: "供应链管理",
      chapters: [
        { externalChapterId: "c1", title: "第一章 导论", sortOrder: 1, children: [] },
        { externalChapterId: "c2", title: "第二章 进阶", sortOrder: 2, children: [] },
      ],
    });
    expect(adapter.extractCurrentChapter(document_)?.externalChapterId).toBe("c1");
    expect(adapter.extractTranscript(document_)).toEqual({
      text: "自定义站点的字幕",
      source: "dom-visible-text",
    });
  });

  it("survives invalid selectors instead of breaking the page", () => {
    vi.stubGlobal("location", new URL("https://learn.acme.test/course/1"));
    const adapter = createCustomAdapter({ ...config, courseSelector: "!!bad", chapterSelector: "!!bad" });

    expect(() => adapter.extractCourse(fakeDocument())).not.toThrow();
  });

  it("takes precedence over built-in adapters", () => {
    const adapter = pickAdapter(
      new URL("https://learn.acme.test/course/1"),
      ["generic-video"],
      [config],
    );
    expect(adapter?.id).toBe("custom-acme");
  });
});

describe("normalizeCustomAdapters", () => {
  it("drops incomplete entries and normalizes domains", () => {
    const result = normalizeCustomAdapters([
      { ...config, domain: "https://learn.acme.test/path" },
      { id: "", name: "坏数据", domain: "x", courseSelector: "h1", chapterSelector: "li" },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("learn.acme.test");
    expect(result[0].chapterIdAttribute).toBe("data-chapter");
  });

  it("keeps an explicitly disabled custom adapter disabled", () => {
    const [adapter] = normalizeCustomAdapters([{ ...config, enabled: false }]);
    expect(adapter.enabled).toBe(false);
  });
});

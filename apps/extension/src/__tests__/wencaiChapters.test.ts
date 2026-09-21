import { describe, expect, it, vi } from "vitest";
import { wencaiSchoolAdapter } from "../adapters/wencaiSchool";

class FakeElement {
  constructor(
    public textContent: string,
    public attrs: Record<string, string> = {},
    public childSections: FakeElement[] = [],
    public chapterName?: string,
    public parentChapter?: FakeElement,
  ) {}

  querySelector(selector: string): FakeElement | null {
    if (selector === ".chapterName" && this.chapterName !== undefined) return new FakeElement(this.chapterName);
    return null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return selector === "li.childSection" ? this.childSections : [];
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  closest(selector: string): FakeElement | null {
    return selector === "li.chapter" ? this.parentChapter ?? null : null;
  }
}

function buildWencaiDocument() {
  const chapter1 = new FakeElement("", {}, [], "第1章:绪章如何走进中共党史");
  chapter1.childSections = [
    new FakeElement("1.1.1党的历史是最好的教科书", { sec: "1", lid: "1" }, [], undefined, chapter1),
    new FakeElement("1.2.1重视党史学习是我们党的优良传统", { sec: "2", lid: "2" }, [], undefined, chapter1),
  ];
  const activeSection = new FakeElement("1.3.1唯物史观是共产党人认识把握历史的根本方法", { sec: "3", lid: "3" }, [], undefined, chapter1);
  chapter1.childSections.push(activeSection);
  const chapter2 = new FakeElement("", {}, [], "第2章:开天辟地的大事变");

  return {
    chapters: [chapter1, chapter2],
    activeSection,
    document: {
      title: "课件播放",
      querySelector: (selector: string) => {
        if (selector === "li.childSection.active") return activeSection;
        if (selector === ".courseName") return new FakeElement("中共党史");
        return null;
      },
      querySelectorAll: (selector: string) => {
        if (selector === "li.chapter") return [chapter1, chapter2];
        return [];
      },
    } as unknown as Document,
  };
}

describe("wencai structured chapters", () => {
  it("extracts chapter tree with nested sections", () => {
    vi.stubGlobal("location", new URL("https://learning.wencaischool.net/x/index.html?course_id=123"));
    const { document } = buildWencaiDocument();

    const course = wencaiSchoolAdapter.extractCourse(document);

    expect(course?.title).toBe("中共党史");
    expect(course?.chapters).toHaveLength(2);
    expect(course?.chapters[0].externalChapterId).toBe("ch1");
    expect(course?.chapters[0].title).toBe("第1章:绪章如何走进中共党史");
    expect(course?.chapters[0].children.map((c) => c.externalChapterId)).toEqual(["ch1-sec1", "ch1-sec2", "ch1-sec3"]);
  });

  it("detects the active section as current chapter with snapshot-compatible id", () => {
    vi.stubGlobal("location", new URL("https://learning.wencaischool.net/x/index.html?course_id=123&scorm_item_id=999"));
    const { document } = buildWencaiDocument();

    const chapter = wencaiSchoolAdapter.extractCurrentChapter(document);

    expect(chapter?.externalChapterId).toBe("ch1-sec3");
    expect(chapter?.title).toContain("唯物史观");
    vi.unstubAllGlobals();
  });
});

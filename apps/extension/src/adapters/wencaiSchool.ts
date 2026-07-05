import type { ChapterNode, CourseSnapshot, LearningAdapter, PageType, TranscriptSnapshot } from "./types";
import { extractHtmlTextTrackTranscript } from "./textTrackTranscript";
import { extractHtmlVideoSource } from "./videoSource";

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function isWencaiHost(url: URL): boolean {
  return url.hostname.endsWith("wencaischool.net");
}

function collectChapters(document: Document): ChapterNode[] {
  const candidates = Array.from(document.querySelectorAll("li, tr, .panel-heading, .chapter, .item, [class*='chapter']"));
  return candidates
    .map((element, index) => ({
      externalChapterId: element.getAttribute("data-id") || element.getAttribute("id") || `${index + 1}`,
      title: clean(element.textContent),
      sortOrder: index + 1,
      children: [],
    }))
    .filter((item) => /第\d+章|\d+\.\d+|课程|中国|管理|思想/.test(item.title))
    .slice(0, 300);
}

export const wencaiSchoolAdapter: LearningAdapter = {
  id: "wencai-school",
  name: "Wencai School",
  matches: isWencaiHost,
  detectPageType: (document: Document, location: Location): PageType => {
    if (document.querySelector("video") || location.href.includes("openlearning/console")) return "player";
    if (clean(document.body.textContent).includes("课件")) return "courseware";
    if (clean(document.body.textContent).includes("在线课程学习")) return "entry";
    return "course";
  },
  extractCourse: (document: Document): CourseSnapshot | null => {
    const breadcrumb = clean(document.querySelector(".breadcrumb, .nav, body")?.textContent);
    const heading = clean(document.querySelector("h1, h2, h3, .course-title")?.textContent);
    const title = heading || breadcrumb.match(/习近平新时代中国特色社会主义思想概论|供应链管理|物流成本管理|运输管理|采购管理/)?.[0] || clean(document.title);
    if (!title) return null;
    return { externalCourseId: location.href, title, chapters: collectChapters(document) };
  },
  extractChapters: collectChapters,
  findVideo: (document: Document): HTMLVideoElement | null => document.querySelector("video"),
  extractVideoSource: extractHtmlVideoSource,
  extractTranscript: (document: Document): TranscriptSnapshot | null => {
    const textTrack = extractHtmlTextTrackTranscript(document);
    if (textTrack) return textTrack;
    const selectors = ["[aria-live]", ".subtitle", ".caption", ".captions", ".vjs-text-track-display", "[class*='subtitle']"];
    for (const selector of selectors) {
      const value = clean(document.querySelector(selector)?.textContent);
      if (value) return { text: value, source: selector === "[aria-live]" ? "aria-live" : "dom-visible-text" };
    }
    return null;
  },
  extractCurrentChapter: (document: Document): ChapterNode | null => {
    const active = document.querySelector(".active, .selected, [aria-selected='true']");
    const title = clean(active?.textContent);
    if (title) return { externalChapterId: active?.getAttribute("data-id") || title, title, sortOrder: 0, children: [] };
    return collectChapters(document)[0] ?? null;
  },
  getNextChapterHint: (document: Document): Element | null => {
    const items = Array.from(document.querySelectorAll("li, .item, [class*='chapter']"));
    return items.find((item) => !item.classList.contains("active") && clean(item.textContent).length > 0) ?? null;
  },
};

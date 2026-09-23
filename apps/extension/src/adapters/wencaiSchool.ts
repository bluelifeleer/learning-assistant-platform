import type { ChapterNode, CourseSnapshot, LearningAdapter, PageType, TranscriptSnapshot } from "./types";
import { extractHtmlTextTrackTranscript } from "./textTrackTranscript";
import { extractHtmlVideoSource } from "./videoSource";

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function isWencaiHost(url: URL): boolean {
  if (!url.hostname.endsWith("wencaischool.net")) return false;
  // 只接管学习/课程页面;学生平台首页、成绩查询等管理页不挂载浮层、不做采集
  return /openlearning|courseware|course/i.test(url.pathname + url.search);
}

function wencaiCourseId(): string {
  const courseId = new URLSearchParams(location.search).get("course_id");
  return courseId ? `wencai-course:${courseId}` : location.origin + location.pathname;
}

function wencaiItemId(): string | null {
  return new URLSearchParams(location.search).get("scorm_item_id");
}

function collectChapters(document: Document): ChapterNode[] {
  const chapterElements = Array.from(document.querySelectorAll("li.chapter"));
  const structured = chapterElements
    .map((chapterElement, chapterIndex) => {
      const title = clean(chapterElement.querySelector(".chapterName")?.textContent);
      if (!title) return null;
      const children = Array.from(chapterElement.querySelectorAll("li.childSection"))
        .map((sectionElement, sectionIndex) => ({
          externalChapterId: `ch${chapterIndex + 1}-sec${sectionElement.getAttribute("sec") ?? `${sectionIndex + 1}`}`,
          title: clean(sectionElement.textContent),
          sortOrder: sectionIndex + 1,
          children: [] as ChapterNode[],
        }))
        .filter((section) => section.title.length > 0);
      return {
        externalChapterId: `ch${chapterIndex + 1}`,
        title,
        sortOrder: chapterIndex + 1,
        children,
      };
    })
    .filter((chapter): chapter is ChapterNode => chapter !== null);
  if (structured.length) return structured;

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
    const courseName = clean(document.querySelector(".courseName")?.textContent);
    const heading = clean(document.querySelector("h1, h2, h3, .course-title")?.textContent);
    const title = courseName || heading || breadcrumb.match(/习近平新时代中国特色社会主义思想概论|供应链管理|物流成本管理|运输管理|采购管理/)?.[0] || clean(document.title);
    if (!title) return null;
    return { externalCourseId: wencaiCourseId(), title, chapters: collectChapters(document) };
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
    const activeSection = document.querySelector("li.childSection.active");
    if (activeSection) {
      const chapterElement = activeSection.closest("li.chapter");
      const chapterIndex = chapterElement
        ? Array.from(document.querySelectorAll("li.chapter")).indexOf(chapterElement)
        : -1;
      const sec = activeSection.getAttribute("sec");
      if (chapterIndex >= 0) {
        return {
          externalChapterId: `ch${chapterIndex + 1}-sec${sec ?? "0"}`,
          title: clean(activeSection.textContent),
          sortOrder: 0,
          children: [],
        };
      }
    }
    const itemId = wencaiItemId();
    const active = document.querySelector(".active, .selected, [aria-selected='true']");
    const title = clean(active?.textContent);
    if (itemId) return { externalChapterId: `wencai-item:${itemId}`, title: title || `课件 ${itemId}`, sortOrder: 0, children: [] };
    if (title) return { externalChapterId: active?.getAttribute("data-id") || title, title, sortOrder: 0, children: [] };
    return collectChapters(document)[0] ?? null;
  },
  getNextChapterHint: (document: Document): Element | null => {
    const items = Array.from(document.querySelectorAll("li, .item, [class*='chapter']"));
    return items.find((item) => !item.classList.contains("active") && clean(item.textContent).length > 0) ?? null;
  },
};

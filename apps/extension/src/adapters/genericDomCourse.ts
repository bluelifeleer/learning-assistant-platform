import type { ChapterNode, CourseSnapshot, LearningAdapter, PageType, TranscriptSnapshot } from "./types";
import { extractHtmlTextTrackTranscript } from "./textTrackTranscript";
import { extractHtmlVideoSource } from "./videoSource";

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function collectListItems(document: Document): ChapterNode[] {
  return Array.from(document.querySelectorAll("li, [role='treeitem'], .chapter, .section"))
    .map((element, index) => ({
      externalChapterId: element.getAttribute("data-id") || `${index + 1}`,
      title: clean(element.textContent),
      sortOrder: index + 1,
      children: [],
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, 200);
}

export const genericDomCourseAdapter: LearningAdapter = {
  id: "generic-dom-course",
  name: "Generic DOM Course",
  matches: (url: URL) => /learn|study|lesson|courseware/i.test(url.href),
  detectPageType: (document: Document): PageType => {
    if (document.querySelector("video")) return "player";
    if (collectListItems(document).length > 0) return "courseware";
    return "course";
  },
  extractCourse: (document: Document): CourseSnapshot | null => {
    const title = clean(document.querySelector("h1, h2, title")?.textContent) || clean(document.title);
    if (!title) return null;
    return { externalCourseId: location.href, title, chapters: collectListItems(document) };
  },
  extractChapters: collectListItems,
  findVideo: (document: Document): HTMLVideoElement | null => document.querySelector("video"),
  extractVideoSource: extractHtmlVideoSource,
  extractTranscript: (document: Document): TranscriptSnapshot | null => {
    const textTrack = extractHtmlTextTrackTranscript(document);
    if (textTrack) return textTrack;
    const value = clean(document.querySelector("[aria-live], .subtitle, .caption, .captions")?.textContent);
    return value ? { text: value, source: "dom-visible-text" } : null;
  },
  extractCurrentChapter: (document: Document): ChapterNode | null => collectListItems(document)[0] ?? null,
  getNextChapterHint: (document: Document): Element | null => document.querySelector("li:not(.active), [role='treeitem']:not([aria-selected='true'])"),
};

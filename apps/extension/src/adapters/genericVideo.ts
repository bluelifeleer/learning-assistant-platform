import type { ChapterNode, CourseSnapshot, LearningAdapter, PageType, TranscriptSnapshot } from "./types";
import { extractHtmlTextTrackTranscript } from "./textTrackTranscript";
import { extractHtmlVideoSource } from "./videoSource";

function text(selector: string, document: Document): string | null {
  return document.querySelector(selector)?.textContent?.trim() || null;
}

export const genericVideoAdapter: LearningAdapter = {
  id: "generic-video",
  name: "Generic Video",
  matches: (url: URL) => /learn|study|lesson|training|mooc|courseware/i.test(url.href),
  detectPageType: (document: Document): PageType => (document.querySelector("video") ? "player" : "unknown"),
  extractCourse: (document: Document): CourseSnapshot | null => {
    const title = text("h1", document) ?? document.title?.trim();
    if (!title) return null;
    return { externalCourseId: location.href, title, chapters: [] };
  },
  extractChapters: (): ChapterNode[] => [],
  findVideo: (document: Document): HTMLVideoElement | null => document.querySelector("video"),
  extractVideoSource: extractHtmlVideoSource,
  extractTranscript: (document: Document): TranscriptSnapshot | null => {
    const textTrack = extractHtmlTextTrackTranscript(document);
    if (textTrack) return textTrack;
    const visibleText = text("[aria-live], .subtitle, .caption, .captions", document);
    if (visibleText) return { text: visibleText, source: "dom-visible-text" };
    return null;
  },
  extractCurrentChapter: (): ChapterNode | null => null,
  getNextChapterHint: (): Element | null => null,
};

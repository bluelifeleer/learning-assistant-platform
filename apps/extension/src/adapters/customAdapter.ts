import type { CustomAdapterConfig } from "../config";
import type { ChapterNode, CourseSnapshot, LearningAdapter, PageType, TranscriptSnapshot } from "./types";
import { extractHtmlTextTrackTranscript } from "./textTrackTranscript";
import { extractHtmlVideoSource } from "./videoSource";

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function safeQuery(document: Document, selector: string): Element | null {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function safeQueryAll(document: Document, selector: string): Element[] {
  if (!selector) return [];
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function chapterFromElement(element: Element, index: number, idAttribute: string): ChapterNode {
  const explicitId = element.getAttribute(idAttribute) || element.getAttribute("data-id") || element.id;
  return {
    externalChapterId: explicitId || `custom-chapter-${index + 1}`,
    title: clean(element.textContent),
    sortOrder: index + 1,
    children: [],
  };
}

/**
 * 用户自定义站点适配器：只依赖几个 CSS selector，不执行用户脚本。
 * 选择器写错时静默跳过，避免把整页采集打断。
 */
export function createCustomAdapter(config: CustomAdapterConfig): LearningAdapter {
  const domain = config.domain.toLowerCase();
  const chapterIdAttribute = config.chapterIdAttribute || "data-id";
  const videoSelector = config.videoSelector || "video";
  const transcriptSelector = config.transcriptSelector || "[aria-live], .subtitle, .caption, .captions";
  const extractChapters = (document: Document): ChapterNode[] =>
    safeQueryAll(document, config.chapterSelector)
      .map((element, index) => chapterFromElement(element, index, chapterIdAttribute))
      .filter((chapter) => chapter.title.length > 0);

  return {
    id: config.id,
    name: config.name,
    matches: (url: URL) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    detectPageType: (document: Document): PageType => (safeQuery(document, videoSelector) ? "player" : "course"),
    extractCourse: (document: Document): CourseSnapshot | null => {
      const title = clean(safeQuery(document, config.courseSelector)?.textContent) || clean(document.title);
      if (!title) return null;
      return {
        externalCourseId: `custom:${config.id}:${location.origin}${location.pathname}`,
        title,
        chapters: extractChapters(document),
      };
    },
    extractChapters,
    findVideo: (document: Document): HTMLVideoElement | null =>
      safeQuery(document, videoSelector) as HTMLVideoElement | null,
    extractVideoSource: extractHtmlVideoSource,
    extractTranscript: (document: Document): TranscriptSnapshot | null => {
      const track = extractHtmlTextTrackTranscript(document);
      if (track) return track;
      const value = clean(safeQuery(document, transcriptSelector)?.textContent);
      return value ? { text: value, source: "dom-visible-text" } : null;
    },
    extractCurrentChapter: (document: Document): ChapterNode | null => {
      const current = config.currentChapterSelector ? safeQuery(document, config.currentChapterSelector) : null;
      if (current) {
        const explicitId = current.getAttribute(chapterIdAttribute) || current.getAttribute("data-id") || current.id;
        const title = clean(current.textContent);
        return title ? { externalChapterId: explicitId || "custom-current", title, sortOrder: 0, children: [] } : null;
      }
      return extractChapters(document)[0] ?? null;
    },
    getNextChapterHint: (): Element | null => null,
  };
}

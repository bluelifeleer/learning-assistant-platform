import type { ChapterNode, CourseSnapshot, LearningAdapter, PageType } from "./types";

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function headings(document: Document): ChapterNode[] {
  return Array.from(document.querySelectorAll("article h2, article h3, main h2, main h3, h2, h3"))
    .map((element, index) => ({
      externalChapterId: element.id || `article-heading-${index + 1}`,
      title: clean(element.textContent),
      sortOrder: index + 1,
      children: [],
    }))
    .filter((chapter) => chapter.title.length > 0)
    .slice(0, 100);
}

/**
 * 通用文章/文档页:只在用户显式开启 articleCapture 时兜底启用。
 * 不提取视频/字幕,主要用于划词笔记和整页笔记;PDF 原生查看器无法被 content script 读取。
 */
export const genericArticleAdapter: LearningAdapter = {
  id: "generic-article",
  name: "网页/文档",
  matches: (url: URL) => url.protocol === "http:" || url.protocol === "https:",
  detectPageType: (): PageType => "courseware",
  extractCourse: (document: Document): CourseSnapshot | null => {
    const title = clean(document.querySelector("article h1, main h1, h1")?.textContent) || clean(document.title);
    if (!title) return null;
    return {
      externalCourseId: `article:${location.origin}${location.pathname}`,
      title,
      chapters: headings(document),
    };
  },
  extractChapters: headings,
  findVideo: (): HTMLVideoElement | null => null,
  extractVideoSource: (): null => null,
  extractTranscript: (): null => null,
  extractCurrentChapter: (document: Document): ChapterNode | null => {
    const chapters = headings(document);
    if (chapters.length === 0) return null;
    // 长文滚动时取"已经滚过屏幕顶部"的最后一个标题；拿不到布局信息时退回第一个
    const elements = Array.from(document.querySelectorAll("article h2, article h3, main h2, main h3, h2, h3"))
      .filter((element) => typeof element.getBoundingClientRect === "function");
    if (elements.length === 0) return chapters[0];
    let current = chapters[0];
    for (let index = 0; index < Math.min(elements.length, chapters.length); index += 1) {
      if (elements[index].getBoundingClientRect().top <= 120) current = chapters[index];
    }
    return current;
  },
  getNextChapterHint: (): Element | null => null,
};

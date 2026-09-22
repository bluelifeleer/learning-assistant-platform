import type { CourseChapterNode, CourseVideoSourceItem, ScreenshotItem } from "../api/client";

export interface FlattenedChapter {
  chapter: CourseChapterNode;
  depth: number;
}

export function flattenChapters(chapters: CourseChapterNode[], depth = 0): FlattenedChapter[] {
  const result: FlattenedChapter[] = [];
  const sorted = [...chapters].sort((a, b) => a.sort_order - b.sort_order);
  for (const chapter of sorted) {
    result.push({ chapter, depth });
    result.push(...flattenChapters(chapter.children, depth + 1));
  }
  return result;
}

export function formatTimecode(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "--:--";
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function sortScreenshotsByTime(screenshots: ScreenshotItem[]): ScreenshotItem[] {
  return [...screenshots].sort(
    (a, b) => (a.video_time_seconds ?? Number.MAX_SAFE_INTEGER) - (b.video_time_seconds ?? Number.MAX_SAFE_INTEGER),
  );
}

export function applyNoteCorrection(
  chapters: CourseChapterNode[],
  noteId: string,
  updated: Partial<CourseChapterNode["notes"][number]>,
): CourseChapterNode[] {
  return chapters.map((chapter) => ({
    ...chapter,
    notes: chapter.notes.map((note) =>
      note.id === noteId ? { ...note, ...updated } : note,
    ),
    children: applyNoteCorrection(chapter.children, noteId, updated),
  }));
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export interface ResolvedVideoMedia {
  url: string;
  mediaType: string;
  expiryWarning: boolean;
}

export function resolveVideoMedia(item: CourseVideoSourceItem | undefined): ResolvedVideoMedia | null {
  if (!item) return null;
  const source = item.video_source;
  const url = source.current_src || source.source_urls[0] || "";
  if (!url) return null;
  return {
    url,
    mediaType: source.media_type || "unknown",
    expiryWarning: source.is_blob || source.is_likely_signed,
  };
}

export function chapterAndDescendantIds(chapters: CourseChapterNode[], id: string): Set<string> {
  const result = new Set<string>();
  const walk = (nodes: CourseChapterNode[], inside: boolean): void => {
    for (const node of nodes) {
      const active = inside || node.id === id;
      if (active) result.add(node.id);
      walk(node.children, active);
    }
  };
  walk(chapters, false);
  return result;
}

import type { ChapterNode } from "../adapters/types";

export interface SnapshotChapterPayload {
  external_chapter_id: string;
  title: string;
  sort_order: number;
  children: SnapshotChapterPayload[];
}

export function mapChapterForSnapshot(chapter: ChapterNode): SnapshotChapterPayload {
  return {
    external_chapter_id: chapter.externalChapterId,
    title: chapter.title,
    sort_order: chapter.sortOrder,
    children: chapter.children.map(mapChapterForSnapshot),
  };
}

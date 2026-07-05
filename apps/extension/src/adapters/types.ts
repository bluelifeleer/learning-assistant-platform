export type PageType = "entry" | "course" | "courseware" | "player" | "unknown";

export interface ChapterNode {
  externalChapterId: string;
  title: string;
  sortOrder: number;
  children: ChapterNode[];
}

export interface CourseSnapshot {
  externalCourseId: string;
  title: string;
  term?: string;
  chapters: ChapterNode[];
}

export interface TranscriptSnapshot {
  text: string;
  source: "track" | "dom-visible-text" | "aria-live" | "manual";
}

export interface LearningAdapter {
  id: string;
  name: string;
  matches(url: URL): boolean;
  detectPageType(document: Document, location: Location): PageType;
  extractCourse(document: Document): CourseSnapshot | null;
  extractChapters(document: Document): ChapterNode[];
  findVideo(document: Document): HTMLVideoElement | null;
  extractTranscript(document: Document): TranscriptSnapshot | null;
  extractCurrentChapter(document: Document): ChapterNode | null;
  getNextChapterHint(document: Document): Element | null;
}

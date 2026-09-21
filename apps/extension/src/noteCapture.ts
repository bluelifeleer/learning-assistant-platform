export interface NoteCaptureInput {
  content: string;
  videoTimeSeconds?: number;
  externalCourseId?: string;
  externalChapterId?: string;
  pageId: string;
}

export interface NoteCapturePayload {
  external_course_id: string;
  external_chapter_id: string;
  video_time_seconds?: number;
  content: string;
}

export function buildNotePayload(input: NoteCaptureInput): NoteCapturePayload {
  return {
    external_course_id: input.externalCourseId ?? input.pageId,
    external_chapter_id: input.externalChapterId ?? input.pageId,
    video_time_seconds: input.videoTimeSeconds,
    content: input.content,
  };
}

export function consoleUrlFromApiBaseUrl(apiBaseUrl: string): string {
  const url = new URL(apiBaseUrl);
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  url.port = String(port + 1);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.origin;
}

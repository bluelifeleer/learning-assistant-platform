export interface ScreenshotCaptureInput {
  imageBase64: string;
  videoTimeSeconds?: number;
  externalCourseId?: string;
  externalChapterId?: string;
  pageId: string;
}

export interface ScreenshotCapturePayload {
  external_course_id: string;
  external_chapter_id: string;
  video_time_seconds?: number;
  image_base64: string;
}

export function buildScreenshotPayload(input: ScreenshotCaptureInput): ScreenshotCapturePayload {
  return {
    external_course_id: input.externalCourseId ?? input.pageId,
    external_chapter_id: input.externalChapterId ?? input.pageId,
    video_time_seconds: input.videoTimeSeconds,
    image_base64: input.imageBase64,
  };
}

import { describe, expect, it } from "vitest";
import { buildScreenshotPayload } from "../screenshotCapture";

describe("buildScreenshotPayload", () => {
  it("uses the course and chapter ids from the adapter when available", () => {
    expect(buildScreenshotPayload({
      imageBase64: "data:image/jpeg;base64,AAAA",
      videoTimeSeconds: 754,
      externalCourseId: "course-1",
      externalChapterId: "chapter-2",
      pageId: "https://learning.example.com/course/1",
    })).toEqual({
      external_course_id: "course-1",
      external_chapter_id: "chapter-2",
      video_time_seconds: 754,
      image_base64: "data:image/jpeg;base64,AAAA",
    });
  });

  it("falls back to the page id when the course or chapter is unknown", () => {
    expect(buildScreenshotPayload({
      imageBase64: "data:image/jpeg;base64,BBBB",
      pageId: "https://learning.example.com/watch",
    })).toEqual({
      external_course_id: "https://learning.example.com/watch",
      external_chapter_id: "https://learning.example.com/watch",
      video_time_seconds: undefined,
      image_base64: "data:image/jpeg;base64,BBBB",
    });
  });

  it("keeps the full data url and omits the video time when there is no video element", () => {
    const payload = buildScreenshotPayload({
      imageBase64: "data:image/jpeg;base64,CCCC",
      externalCourseId: "course-1",
      externalChapterId: "chapter-1",
      pageId: "https://learning.example.com/course/1",
    });

    expect(payload.image_base64).toBe("data:image/jpeg;base64,CCCC");
    expect(payload.video_time_seconds).toBeUndefined();
    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty("video_time_seconds");
  });
});

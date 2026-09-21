import { describe, expect, it } from "vitest";
import { buildNotePayload, consoleUrlFromApiBaseUrl } from "../noteCapture";

describe("buildNotePayload", () => {
  it("uses the course and chapter ids from the adapter when available", () => {
    expect(buildNotePayload({
      content: "重点笔记",
      videoTimeSeconds: 754,
      externalCourseId: "course-1",
      externalChapterId: "chapter-2",
      pageId: "https://learning.example.com/course/1",
    })).toEqual({
      external_course_id: "course-1",
      external_chapter_id: "chapter-2",
      video_time_seconds: 754,
      content: "重点笔记",
    });
  });

  it("falls back to the page id when the course or chapter is unknown", () => {
    expect(buildNotePayload({
      content: "无课程页笔记",
      pageId: "https://learning.example.com/watch",
    })).toEqual({
      external_course_id: "https://learning.example.com/watch",
      external_chapter_id: "https://learning.example.com/watch",
      video_time_seconds: undefined,
      content: "无课程页笔记",
    });
  });

  it("omits the video time when there is no video element", () => {
    const payload = buildNotePayload({
      content: "无视频笔记",
      externalCourseId: "course-1",
      externalChapterId: "chapter-1",
      pageId: "https://learning.example.com/course/1",
    });

    expect(payload.video_time_seconds).toBeUndefined();
    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty("video_time_seconds");
  });
});

describe("consoleUrlFromApiBaseUrl", () => {
  it("derives the console origin from the api base url", () => {
    expect(consoleUrlFromApiBaseUrl("http://127.0.0.1:17890/api/v1")).toBe("http://127.0.0.1:17891");
    expect(consoleUrlFromApiBaseUrl("http://localhost:17890/api/v1")).toBe("http://localhost:17891");
  });

  it("strips path, query and hash from the derived console url", () => {
    expect(consoleUrlFromApiBaseUrl("https://api.example.com:8443/api/v1?x=1#y")).toBe("https://api.example.com:8444");
  });
});

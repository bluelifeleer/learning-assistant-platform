import { describe, expect, it, vi } from "vitest";
import { collectAndReportSubtitleTrackFiles } from "../subtitleTrackReporter";

function fakeDocumentWithTracks(tracks: unknown[]): Document {
  return {
    querySelectorAll: (selector: string) => selector === "video track[src]" ? tracks : [],
  } as unknown as Document;
}

describe("subtitle track reporter", () => {
  it("reports imported subtitle file diagnostics after posting parsed segments", async () => {
    const post = vi.fn().mockResolvedValue(undefined);

    await collectAndReportSubtitleTrackFiles({
      document: fakeDocumentWithTracks([
        { src: "/lesson.vtt", getAttribute: (name: string) => name === "src" ? "/lesson.vtt" : "subtitles" },
      ]),
      locationHref: "https://learning.example.com/course/1",
      client: { post },
      fetchSubtitleFileText: vi.fn().mockResolvedValue("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n第一句"),
      externalCourseId: "course-1",
      externalChapterId: "chapter-1",
      sessionId: "session-1",
    });

    expect(post).toHaveBeenCalledWith("/capture/transcript-segment", {
      external_course_id: "course-1",
      external_chapter_id: "chapter-1",
      session_id: "session-1",
      text: "第一句",
      source: "track-file",
      start_seconds: 1,
      end_seconds: 2,
    });
    expect(post).toHaveBeenCalledWith("/capture/video-event", {
      session_id: "session-1",
      event_type: "subtitle-diagnostic",
      payload: {
        course_url: "https://learning.example.com/course/1",
        external_course_id: "course-1",
        external_chapter_id: "chapter-1",
        subtitle_url: "https://learning.example.com/lesson.vtt",
        status: "imported",
        segment_count: 1,
      },
    });
  });

  it("reports fetch failure diagnostics without throwing", async () => {
    const post = vi.fn().mockResolvedValue(undefined);

    await collectAndReportSubtitleTrackFiles({
      document: fakeDocumentWithTracks([
        { src: "https://cdn.example.com/missing.vtt", getAttribute: (name: string) => name === "src" ? "https://cdn.example.com/missing.vtt" : "captions" },
      ]),
      locationHref: "https://learning.example.com/course/1",
      client: { post },
      fetchSubtitleFileText: vi.fn().mockRejectedValue(new Error("403")),
      externalCourseId: "course-1",
      externalChapterId: "chapter-1",
      sessionId: "session-1",
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/capture/video-event", {
      session_id: "session-1",
      event_type: "subtitle-diagnostic",
      payload: {
        course_url: "https://learning.example.com/course/1",
        external_course_id: "course-1",
        external_chapter_id: "chapter-1",
        subtitle_url: "https://cdn.example.com/missing.vtt",
        status: "fetch-failed",
        error: "403",
      },
    });
  });
});

import { describe, expect, it } from "vitest";
import { getSubtitleDiagnostics } from "./pluginDiagnostics";
import type { VideoEventItem } from "../api/client";

describe("plugin diagnostics", () => {
  it("formats subtitle diagnostic events for the plugin panel", () => {
    const events: VideoEventItem[] = [
      {
        id: "event-1",
        session_id: "session-1",
        event_type: "subtitle-diagnostic",
        video_source: {},
        payload: {
          status: "imported",
          subtitle_url: "https://cdn.example.com/lesson.vtt",
          segment_count: 12,
        },
      },
      {
        id: "event-2",
        session_id: "session-1",
        event_type: "video-source",
        video_source: {},
        payload: {},
      },
    ];

    expect(getSubtitleDiagnostics(events)).toEqual([
      {
        id: "event-1",
        status: "已导入",
        detail: "12 条字幕片段",
        subtitleUrl: "https://cdn.example.com/lesson.vtt",
      },
    ]);
  });
});

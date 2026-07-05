import { describe, expect, it, vi } from "vitest";
import { handleSubtitleFetchMessage } from "../backgroundSubtitleFetch";

describe("background subtitle fetch proxy", () => {
  it("fetches subtitle files for content scripts through the extension background", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n字幕"),
    });

    const response = await handleSubtitleFetchMessage(
      { type: "learning-assistant:fetch-subtitle-file", url: "https://cdn.example.com/lesson.vtt" },
      { fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith("https://cdn.example.com/lesson.vtt", { credentials: "include" });
    expect(response).toEqual({
      ok: true,
      text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n字幕",
    });
  });

  it("returns a structured error when the subtitle request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("forbidden"),
    });

    const response = await handleSubtitleFetchMessage(
      { type: "learning-assistant:fetch-subtitle-file", url: "https://cdn.example.com/lesson.vtt" },
      { fetch: fetchMock },
    );

    expect(response).toEqual({
      ok: false,
      error: "Subtitle request failed: 403",
    });
  });
});

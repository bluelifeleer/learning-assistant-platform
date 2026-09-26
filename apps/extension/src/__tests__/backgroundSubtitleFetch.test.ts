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

  it("rejects non-http(s) subtitle urls without fetching", async () => {
    const fetchMock = vi.fn();

    for (const url of ["file:///etc/passwd", "chrome://extensions", "javascript:alert(1)", "not a url"]) {
      const response = await handleSubtitleFetchMessage(
        { type: "learning-assistant:fetch-subtitle-file", url },
        { fetch: fetchMock },
      );

      expect(response).toEqual({
        ok: false,
        error: "Unsupported subtitle URL: only public http(s) URLs are allowed",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects private/loopback/link-local subtitle urls without fetching", async () => {
    const fetchMock = vi.fn();

    for (const url of [
      "http://127.0.0.1/latest/meta-data",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.5/secret.vtt",
      "http://192.168.1.1/admin",
      "http://172.16.0.1/secret.vtt",
      "http://[::1]/secret.vtt",
      "http://localhost/secret.vtt",
      "http://internal.corp.local/secret.vtt",
    ]) {
      const response = await handleSubtitleFetchMessage(
        { type: "learning-assistant:fetch-subtitle-file", url },
        { fetch: fetchMock },
      );

      expect(response).toEqual({
        ok: false,
        error: "Unsupported subtitle URL: only public http(s) URLs are allowed",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

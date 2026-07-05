import { describe, expect, it, vi } from "vitest";
import { fetchSubtitleFileText } from "../subtitleFetchClient";

describe("subtitle fetch client", () => {
  it("uses the extension background proxy before direct fetch", async () => {
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      callback({ ok: true, text: "WEBVTT from background" });
    });
    const fetchMock = vi.fn();

    const text = await fetchSubtitleFileText("https://cdn.example.com/lesson.vtt", {
      runtime: { sendMessage },
      fetch: fetchMock,
    });

    expect(text).toBe("WEBVTT from background");
    expect(sendMessage).toHaveBeenCalledWith(
      { type: "learning-assistant:fetch-subtitle-file", url: "https://cdn.example.com/lesson.vtt" },
      expect.any(Function),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to direct fetch when the background proxy is unavailable", async () => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback({ ok: false, error: "background unavailable" });
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("WEBVTT from direct fetch"),
    });

    const text = await fetchSubtitleFileText("https://cdn.example.com/lesson.vtt", {
      runtime: { sendMessage },
      fetch: fetchMock,
    });

    expect(text).toBe("WEBVTT from direct fetch");
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.example.com/lesson.vtt", { credentials: "include" });
  });
});

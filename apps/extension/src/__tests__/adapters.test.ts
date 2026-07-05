import { describe, expect, it } from "vitest";
import { genericVideoAdapter } from "../adapters/genericVideo";
import { pickAdapter } from "../adapters/registry";

describe("adapter registry", () => {
  it("selects wencai adapter for wencai learning domains", () => {
    const adapter = pickAdapter(new URL("https://learning.wencaischool.net/openlearning/console/"));
    expect(adapter?.id).toBe("wencai-school");
  });

  it("does not select an adapter for unrelated sites", () => {
    const adapter = pickAdapter(new URL("https://example.com/course/video"));
    expect(adapter).toBeNull();
  });

  it("can use generic video on learning-like urls when it is enabled", () => {
    const adapter = pickAdapter(new URL("https://learning.wencaischool.net/openlearning/console/"), ["generic-video"]);
    expect(adapter?.id).toBe("generic-video");
  });

  it("selects generic video only for learning-like urls", () => {
    const adapter = pickAdapter(new URL("https://training.example.com/lesson/1"), ["generic-video"]);
    expect(adapter?.id).toBe("generic-video");
  });

  it("extracts video source metadata without downloading media", () => {
    const sourceElements = [
      { src: "https://cdn.example.com/course/lesson.m3u8?token=secret", type: "application/vnd.apple.mpegurl" },
      { src: "https://cdn.example.com/course/lesson-720.mp4", type: "video/mp4" },
    ];
    const video = {
      currentSrc: "blob:https://training.example.com/session-1",
      src: "blob:https://training.example.com/session-1",
      poster: "/cover.png",
      querySelectorAll: (selector: string) => selector === "source" ? sourceElements : [],
    } as unknown as HTMLVideoElement;
    const fakeDocument = {
      querySelector: (selector: string) => selector === "video" ? video : null,
    } as unknown as Document;

    const source = genericVideoAdapter.extractVideoSource(fakeDocument);

    expect(source).toEqual({
      currentSrc: "blob:https://training.example.com/session-1",
      sourceUrls: [
        "https://cdn.example.com/course/lesson.m3u8?token=secret",
        "https://cdn.example.com/course/lesson-720.mp4",
      ],
      posterUrl: "/cover.png",
      isBlob: true,
      isLikelySigned: true,
      mediaType: "hls",
    });
  });

  it("extracts active text track cues before visible subtitle text", () => {
    const activeCues = [
      { text: "第一句标准字幕" },
      { text: "第二句标准字幕" },
    ];
    const video = {
      textTracks: [
        { activeCues },
      ],
    } as unknown as HTMLVideoElement;
    const fakeDocument = {
      querySelector: (selector: string) => {
        if (selector === "video") return video;
        if (selector === "[aria-live], .subtitle, .caption, .captions") return { textContent: "页面可见字幕" };
        return null;
      },
    } as unknown as Document;

    const transcript = genericVideoAdapter.extractTranscript(fakeDocument);

    expect(transcript).toEqual({
      text: "第一句标准字幕\n第二句标准字幕",
      source: "track",
    });
  });
});

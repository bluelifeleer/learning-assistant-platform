import { afterEach, describe, expect, it, vi } from "vitest";
import { genericDomCourseAdapter } from "../adapters/genericDomCourse";
import { genericVideoAdapter } from "../adapters/genericVideo";
import { pickAdapter } from "../adapters/registry";
import { wencaiSchoolAdapter } from "../adapters/wencaiSchool";

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

describe("stable external course ids", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["wencai-school", wencaiSchoolAdapter],
    ["generic-video", genericVideoAdapter],
    ["generic-dom-course", genericDomCourseAdapter],
  ] as const)("ignores query params and hash for %s", (_id, adapter) => {
    vi.stubGlobal("location", new URL("https://learning.example.com/course/42?from=share#chapter-1"));
    const fakeDocument = {
      querySelector: () => null,
      querySelectorAll: () => [],
      title: "示例课程",
    } as unknown as Document;

    const course = adapter.extractCourse(fakeDocument);

    expect(course?.externalCourseId).toBe("https://learning.example.com/course/42");
  });

  it("uses the course_id query param as wencai course identity across pages", () => {
    const fakeDocument = {
      querySelector: () => null,
      querySelectorAll: () => [],
      title: "示例课程",
    } as unknown as Document;

    vi.stubGlobal("location", new URL("https://learning.wencaischool.net/openlearning/course/learning/learn_course.jsp?course_id=123&x=1"));
    const fromEntryPage = wencaiSchoolAdapter.extractCourse(fakeDocument);

    vi.stubGlobal("location", new URL("https://learning.wencaischool.net/openlearning/separation/courseware/index.html?course_id=123&scorm_item_id=456"));
    const fromPlayerFrame = wencaiSchoolAdapter.extractCourse(fakeDocument);

    expect(fromEntryPage?.externalCourseId).toBe("wencai-course:123");
    expect(fromPlayerFrame?.externalCourseId).toBe("wencai-course:123");
  });

  it("only reports wencai chapter ids that exist in the snapshot", () => {
    vi.stubGlobal("location", new URL("https://learning.wencaischool.net/openlearning/separation/courseware/index.html?course_id=123&scorm_item_id=456"));
    const emptyDocument = {
      querySelector: () => null,
      querySelectorAll: () => [],
      title: "示例课程",
    } as unknown as Document;

    // 页面上没有任何可解析的章节树时,快照里就不存在章节。
    // 旧实现会编一个 wencai-item:456(快照永远不会产生这种 id)→ 后端 404 →
    // 采集数据被静默丢弃。现在返回 null,由调用方跳过上报。
    expect(wencaiSchoolAdapter.extractCurrentChapter(emptyDocument)).toBeNull();
  });
});

describe("wencai adapter page scoping", () => {
  it("ignores the student console homepage and other non-learning pages", () => {
    expect(wencaiSchoolAdapter.matches(new URL("https://edu.wencaischool.net/dzkjzs_student/console/templates/normal/"))).toBe(false);
    expect(wencaiSchoolAdapter.matches(new URL("https://learning.wencaischool.net/openlearning/separation/courseware/index.html?course_id=1"))).toBe(true);
    expect(wencaiSchoolAdapter.matches(new URL("https://learning.wencaischool.net/openlearning/console/?urltoken=x"))).toBe(true);
  });
});

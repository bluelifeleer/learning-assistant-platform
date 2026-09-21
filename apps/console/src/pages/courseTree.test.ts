import { describe, expect, it } from "vitest";
import type { CourseChapterNode, ScreenshotItem } from "../api/client";
import { applyNoteCorrection, chapterAndDescendantIds, flattenChapters, formatDateTime, formatTimecode, resolveVideoMedia, sortScreenshotsByTime } from "./courseTree";

function chapter(id: string, sortOrder: number, children: CourseChapterNode[] = []): CourseChapterNode {
  return { id, title: `章节${id}`, sort_order: sortOrder, duration_seconds: null, children, transcripts: [], notes: [] };
}

function screenshot(id: string, videoTimeSeconds?: number | null): ScreenshotItem {
  return {
    id,
    course_id: "course-1",
    course_title: "课程",
    chapter_id: "chapter-1",
    chapter_title: "章节",
    video_time_seconds: videoTimeSeconds ?? null,
    created_at: null,
  };
}

describe("flattenChapters", () => {
  it("flattens nested chapters in sort order with depth", () => {
    const tree = [
      chapter("b", 2),
      chapter("a", 1, [chapter("a2", 2), chapter("a1", 1)]),
    ];

    const flat = flattenChapters(tree);

    expect(flat.map((entry) => [entry.chapter.id, entry.depth])).toEqual([
      ["a", 0],
      ["a1", 1],
      ["a2", 1],
      ["b", 0],
    ]);
  });

  it("returns an empty list for a course without chapters", () => {
    expect(flattenChapters([])).toEqual([]);
  });
});

describe("formatTimecode", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatTimecode(0)).toBe("00:00");
    expect(formatTimecode(65)).toBe("01:05");
    expect(formatTimecode(600)).toBe("10:00");
  });

  it("handles missing and fractional values", () => {
    expect(formatTimecode(null)).toBe("--:--");
    expect(formatTimecode(undefined)).toBe("--:--");
    expect(formatTimecode(61.9)).toBe("01:01");
    expect(formatTimecode(-5)).toBe("00:00");
  });
});

describe("sortScreenshotsByTime", () => {
  it("sorts screenshots by video time without mutating the input", () => {
    const items = [screenshot("c", 120), screenshot("a", 5), screenshot("b", 60)];

    const sorted = sortScreenshotsByTime(items);

    expect(sorted.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(items.map((item) => item.id)).toEqual(["c", "a", "b"]);
  });

  it("keeps screenshots without a video time at the end", () => {
    const sorted = sortScreenshotsByTime([screenshot("late", null), screenshot("early", 10)]);

    expect(sorted.map((item) => item.id)).toEqual(["early", "late"]);
  });
});

describe("formatDateTime", () => {
  it("returns an empty string for missing or invalid values", () => {
    expect(formatDateTime(null)).toBe("");
    expect(formatDateTime(undefined)).toBe("");
    expect(formatDateTime("not-a-date")).toBe("");
  });

  it("formats an ISO timestamp", () => {
    expect(formatDateTime("2026-09-21T08:30:00.000Z")).not.toBe("");
  });
});

describe("applyNoteCorrection", () => {
  it("updates the note's correction inside a nested chapter without touching the original content", () => {
    const tree = [
      chapter("c1", 1, [
        {
          ...chapter("c1.1", 1),
          notes: [{ id: "n1", video_time_seconds: 220, content: "学识名利", corrected_content: null, created_at: null }],
        },
      ]),
    ];

    const updated = applyNoteCorrection(tree, "n1", { content: "学识名利", corrected_content: "学史明理" });

    const note = updated[0].children[0].notes[0];
    expect(note.content).toBe("学识名利");
    expect(note.corrected_content).toBe("学史明理");
    expect(tree[0].children[0].notes[0].corrected_content).toBeNull();
  });

  it("clears the correction back to the original", () => {
    const tree = [
      {
        ...chapter("c1", 1),
        notes: [{ id: "n1", video_time_seconds: 220, content: "学识名利", corrected_content: "学史明理", created_at: null }],
      },
    ];

    const updated = applyNoteCorrection(tree, "n1", { content: "学识名利", corrected_content: null });

    expect(updated[0].notes[0].corrected_content).toBeNull();
  });
});

describe("resolveVideoMedia", () => {
  it("picks currentSrc first and flags signed links", () => {
    const media = resolveVideoMedia({
      chapter_id: "c1",
      course_url: "https://learning.example.com/course/1",
      video_source: {
        current_src: "https://cdn.example.com/a.mp4?sign=x",
        source_urls: ["https://cdn.example.com/a.mp4?sign=x"],
        is_blob: false,
        is_likely_signed: true,
        media_type: "file",
      },
    });

    expect(media).toEqual({ url: "https://cdn.example.com/a.mp4?sign=x", mediaType: "file", expiryWarning: true });
  });

  it("falls back to the first source url and flags blob sources", () => {
    const media = resolveVideoMedia({
      chapter_id: "c1",
      video_source: { current_src: null, source_urls: ["blob:https://x/1"], is_blob: true, is_likely_signed: false, media_type: "blob" },
    });

    expect(media?.url).toBe("blob:https://x/1");
    expect(media?.expiryWarning).toBe(true);
  });

  it("returns null when there is no usable url", () => {
    expect(resolveVideoMedia(undefined)).toBeNull();
    expect(
      resolveVideoMedia({
        chapter_id: "c1",
        video_source: { current_src: null, source_urls: [], is_blob: false, is_likely_signed: false, media_type: "unknown" },
      }),
    ).toBeNull();
  });
});

describe("chapterAndDescendantIds", () => {
  it("collects the chapter and all nested sections", () => {
    const tree = [
      chapter("c1", 1, [chapter("c1.1", 1), chapter("c1.2", 2, [chapter("c1.2.1", 1)])]),
      chapter("c2", 2),
    ];

    expect([...chapterAndDescendantIds(tree, "c1")].sort()).toEqual(["c1", "c1.1", "c1.2", "c1.2.1"]);
    expect([...chapterAndDescendantIds(tree, "c1.2")].sort()).toEqual(["c1.2", "c1.2.1"]);
    expect([...chapterAndDescendantIds(tree, "missing")]).toEqual([]);
  });
});

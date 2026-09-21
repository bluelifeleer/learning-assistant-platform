import { describe, expect, it } from "vitest";
import type { CourseChapterNode, ScreenshotItem } from "../api/client";
import { flattenChapters, formatDateTime, formatTimecode, sortScreenshotsByTime } from "./courseTree";

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

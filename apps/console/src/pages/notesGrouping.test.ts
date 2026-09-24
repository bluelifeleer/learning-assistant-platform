import { describe, expect, it } from "vitest";
import type { NoteItem } from "../api/client";
import { filterNotesByTags, groupNotesByCourse, noteDisplayContent } from "./notesGrouping";

function makeNote(overrides: Partial<NoteItem>): NoteItem {
  return {
    id: overrides.id ?? "n1",
    course_id: overrides.course_id ?? "c1",
    course_title: overrides.course_title ?? "课程A",
    content: overrides.content ?? "内容",
    corrected_content: overrides.corrected_content ?? null,
    tags: overrides.tags ?? [],
  };
}

describe("noteDisplayContent", () => {
  it("prefers corrected content when present", () => {
    expect(noteDisplayContent(makeNote({ content: "原文", corrected_content: "勘误后" }))).toBe("勘误后");
  });

  it("falls back to raw content when correction is empty", () => {
    expect(noteDisplayContent(makeNote({ content: "原文", corrected_content: "  " }))).toBe("原文");
    expect(noteDisplayContent(makeNote({ content: "原文" }))).toBe("原文");
  });
});

describe("filterNotesByTags", () => {
  const notes = [
    makeNote({ id: "1", tags: ["考点"] }),
    makeNote({ id: "2", tags: ["高频", "简答"] }),
    makeNote({ id: "3", tags: [] }),
  ];

  it("returns all notes when no tag selected", () => {
    expect(filterNotesByTags(notes, [])).toHaveLength(3);
  });

  it("keeps notes matching any selected tag", () => {
    expect(filterNotesByTags(notes, ["考点"])).toHaveLength(1);
    expect(filterNotesByTags(notes, ["考点", "简答"])).toHaveLength(2);
  });
});

describe("groupNotesByCourse", () => {
  it("groups by course preserving first-seen order", () => {
    const groups = groupNotesByCourse([
      makeNote({ id: "1", course_id: "c1", course_title: "A" }),
      makeNote({ id: "2", course_id: "c2", course_title: "B" }),
      makeNote({ id: "3", course_id: "c1", course_title: "A" }),
    ]);
    expect(groups.map((group) => group.course_id)).toEqual(["c1", "c2"]);
    expect(groups[0].items.map((note) => note.id)).toEqual(["1", "3"]);
  });
});

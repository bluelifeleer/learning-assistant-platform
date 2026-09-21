import { describe, expect, it } from "vitest";
import { mapChapterForSnapshot } from "../capture/snapshotChapters";

describe("mapChapterForSnapshot", () => {
  it("maps a flat chapter", () => {
    expect(
      mapChapterForSnapshot({ externalChapterId: "ch1", title: "第1章", sortOrder: 1, children: [] }),
    ).toEqual({ external_chapter_id: "ch1", title: "第1章", sort_order: 1, children: [] });
  });

  it("maps nested sections recursively", () => {
    const payload = mapChapterForSnapshot({
      externalChapterId: "ch1",
      title: "第1章",
      sortOrder: 1,
      children: [
        { externalChapterId: "ch1-sec1", title: "1.1 节", sortOrder: 1, children: [] },
        { externalChapterId: "ch1-sec2", title: "1.2 节", sortOrder: 2, children: [] },
      ],
    });

    expect(payload.children).toHaveLength(2);
    expect(payload.children[1]).toEqual({ external_chapter_id: "ch1-sec2", title: "1.2 节", sort_order: 2, children: [] });
  });
});

import { describe, expect, it } from "vitest";
import { matchesKeyword, sortItems, toggleAllIds, toggleId } from "./listQuery";

describe("matchesKeyword", () => {
  it("matches everything for a blank keyword", () => {
    expect(matchesKeyword(["任意内容"], "")).toBe(true);
    expect(matchesKeyword(["任意内容"], "   ")).toBe(true);
  });

  it("is case-insensitive and ignores surrounding whitespace", () => {
    expect(matchesKeyword(["Supply Chain"], "  supply ")).toBe(true);
    expect(matchesKeyword(["supply chain"], "CHAIN")).toBe(true);
  });

  it("requires every term to appear, in any order", () => {
    const fields = ["中共党史", "这章讲的是党史学习方法"];
    expect(matchesKeyword(fields, "党史 方法")).toBe(true);
    expect(matchesKeyword(fields, "方法 党史")).toBe(true);
    expect(matchesKeyword(fields, "党史 供应链")).toBe(false);
  });

  it("searches across all provided fields and tolerates nullish values", () => {
    expect(matchesKeyword(["标题", null, undefined, "内容里的关键词"], "关键词")).toBe(true);
    expect(matchesKeyword([null, undefined], "x")).toBe(false);
  });
});

describe("sortItems", () => {
  const rows = [
    { name: "b", count: 2, at: null },
    { name: "a", count: 10, at: "2026-01-01" },
    { name: "c", count: null, at: "2025-01-01" },
  ];

  it("sorts numbers numerically, not lexicographically", () => {
    expect(sortItems(rows, (row) => row.count).map((row) => row.name)).toEqual(["b", "a", "c"]);
  });

  it("reverses for desc but always keeps empty values last", () => {
    expect(sortItems(rows, (row) => row.count, "desc").map((row) => row.name)).toEqual(["a", "b", "c"]);
    expect(sortItems(rows, (row) => row.at, "desc").map((row) => row.name)).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the input array", () => {
    const original = [...rows];
    sortItems(rows, (row) => row.name);
    expect(rows).toEqual(original);
  });
});

describe("selection helpers", () => {
  it("toggles a single id on and off", () => {
    expect(toggleId([], "a")).toEqual(["a"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });

  it("selects and clears only the visible page, keeping other selections", () => {
    expect(toggleAllIds(["keep"], ["a", "b"], true)).toEqual(["keep", "a", "b"]);
    expect(toggleAllIds(["keep", "a", "b"], ["a", "b"], false)).toEqual(["keep"]);
  });
});

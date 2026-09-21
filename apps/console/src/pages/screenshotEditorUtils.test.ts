import { describe, expect, it } from "vitest";
import { editorFontSize, mosaicFactor, normalizeRect } from "./screenshotEditorUtils";

describe("normalizeRect", () => {
  it("normalizes drag direction and clamps to the canvas", () => {
    expect(normalizeRect(100, 80, 40, 30, 200, 200)).toEqual({ x: 40, y: 30, w: 60, h: 50 });
    expect(normalizeRect(-20, 10, 250, 60, 200, 200)).toEqual({ x: 0, y: 10, w: 200, h: 50 });
  });

  it("returns null for a tiny accidental drag", () => {
    expect(normalizeRect(10, 10, 12, 11, 200, 200)).toBeNull();
  });
});

describe("mosaicFactor", () => {
  it("scales with the selection size and never goes below 8", () => {
    expect(mosaicFactor({ x: 0, y: 0, w: 30, h: 30 })).toBe(8);
    expect(mosaicFactor({ x: 0, y: 0, w: 400, h: 200 })).toBe(20);
  });
});

describe("editorFontSize", () => {
  it("scales with image width and keeps a readable floor", () => {
    expect(editorFontSize(800)).toBe(20);
    expect(editorFontSize(2400)).toBe(48);
  });
});

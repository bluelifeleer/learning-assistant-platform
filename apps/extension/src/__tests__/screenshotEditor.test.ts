import { describe, expect, it } from "vitest";
import { intersectRect, isUsableRect, rectFromPoints } from "../ui/screenshotEditor";

describe("screenshot editor geometry", () => {
  it("normalizes a reverse drag", () => {
    expect(rectFromPoints({ x: 120, y: 90 }, { x: 20, y: 10 })).toEqual({
      x: 20,
      y: 10,
      width: 100,
      height: 80,
    });
  });

  it("intersects crop and redaction rectangles", () => {
    expect(intersectRect(
      { x: 10, y: 10, width: 100, height: 100 },
      { x: 80, y: 20, width: 100, height: 40 },
    )).toEqual({ x: 80, y: 20, width: 30, height: 40 });
    expect(intersectRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 20, width: 5, height: 5 },
    )).toBeNull();
  });

  it("rejects tiny accidental selections", () => {
    expect(isUsableRect({ x: 0, y: 0, width: 3, height: 100 })).toBe(false);
    expect(isUsableRect({ x: 0, y: 0, width: 8, height: 8 })).toBe(true);
  });
});

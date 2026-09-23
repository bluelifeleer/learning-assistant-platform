import { describe, expect, it } from "vitest";
import {
  clampWidgetPosition,
  defaultWidgetPosition,
  QA_WIDGET_EXPANDED_WIDTH,
  QA_WIDGET_HEIGHT,
  QA_WIDGET_MARGIN,
  QA_WIDGET_WIDTH,
  widgetSize,
} from "./qaWidgetDrag";

describe("clampWidgetPosition", () => {
  it("keeps a position already inside the viewport unchanged", () => {
    expect(clampWidgetPosition(100, 80, 400, 560, 1280, 800)).toEqual({ x: 100, y: 80 });
  });

  it("clamps overflow to the left", () => {
    expect(clampWidgetPosition(-50, 100, 400, 560, 1280, 800)).toEqual({ x: 0, y: 100 });
  });

  it("clamps overflow to the top", () => {
    expect(clampWidgetPosition(100, -20, 400, 560, 1280, 800)).toEqual({ x: 100, y: 0 });
  });

  it("clamps overflow to the right", () => {
    expect(clampWidgetPosition(1000, 100, 400, 560, 1280, 800)).toEqual({ x: 880, y: 100 });
  });

  it("clamps overflow to the bottom", () => {
    expect(clampWidgetPosition(100, 700, 400, 560, 1280, 800)).toEqual({ x: 100, y: 240 });
  });

  it("pins to 0 when the widget is wider than the viewport", () => {
    expect(clampWidgetPosition(300, 100, 400, 560, 360, 800)).toEqual({ x: 0, y: 100 });
  });

  it("pins to 0 when the widget is taller than the viewport", () => {
    expect(clampWidgetPosition(100, 300, 400, 560, 1280, 500)).toEqual({ x: 100, y: 0 });
  });
});

describe("defaultWidgetPosition", () => {
  it("anchors the widget to the bottom-right with the standard margin", () => {
    expect(defaultWidgetPosition(400, 560, 1280, 800)).toEqual({
      x: 1280 - 400 - QA_WIDGET_MARGIN,
      y: 800 - 560 - QA_WIDGET_MARGIN,
    });
  });

  it("stays inside a viewport smaller than the widget", () => {
    expect(defaultWidgetPosition(400, 560, 360, 500)).toEqual({ x: 0, y: 0 });
  });
});

describe("widgetSize", () => {
  it("returns the base size when not expanded", () => {
    expect(widgetSize(false, 1280, 800)).toEqual({ width: QA_WIDGET_WIDTH, height: QA_WIDGET_HEIGHT });
  });

  it("expands to the expanded width and viewport-ratio height", () => {
    expect(widgetSize(true, 1280, 800)).toEqual({ width: QA_WIDGET_EXPANDED_WIDTH, height: Math.round(800 * 0.82) });
  });

  it("never exceeds the viewport minus margins", () => {
    const size = widgetSize(true, 700, 640);
    expect(size.width).toBe(700 - QA_WIDGET_MARGIN * 2);
    expect(size.height).toBe(Math.round(640 * 0.82));
  });

  it("fits within the viewport minus margins on small screens", () => {
    const size = widgetSize(true, 420, 500);
    expect(size.width).toBe(420 - QA_WIDGET_MARGIN * 2);
    expect(size.height).toBe(Math.round(500 * 0.82));
  });
});

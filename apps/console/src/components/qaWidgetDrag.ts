export interface WidgetPosition {
  x: number;
  y: number;
}

export const QA_WIDGET_WIDTH = 400;
export const QA_WIDGET_HEIGHT = 560;
export const QA_WIDGET_MARGIN = 24;
export const QA_WIDGET_EXPANDED_WIDTH = 760;
export const QA_WIDGET_EXPANDED_HEIGHT_RATIO = 0.82;

export interface WidgetSize {
  width: number;
  height: number;
}

export function widgetSize(expanded: boolean, viewportWidth: number, viewportHeight: number): WidgetSize {
  if (!expanded) return { width: QA_WIDGET_WIDTH, height: QA_WIDGET_HEIGHT };
  return {
    width: Math.min(QA_WIDGET_EXPANDED_WIDTH, viewportWidth - QA_WIDGET_MARGIN * 2),
    height: Math.round(viewportHeight * QA_WIDGET_EXPANDED_HEIGHT_RATIO),
  };
}

export function clampWidgetPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): WidgetPosition {
  const maxX = Math.max(0, viewportWidth - width);
  const maxY = Math.max(0, viewportHeight - height);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}

export function defaultWidgetPosition(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): WidgetPosition {
  return clampWidgetPosition(
    viewportWidth - width - QA_WIDGET_MARGIN,
    viewportHeight - height - QA_WIDGET_MARGIN,
    width,
    height,
    viewportWidth,
    viewportHeight,
  );
}

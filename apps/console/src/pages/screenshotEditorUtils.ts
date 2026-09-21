export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number, maxW: number, maxH: number): Rect | null {
  const x = Math.max(0, Math.min(x1, x2));
  const y = Math.max(0, Math.min(y1, y2));
  const w = Math.min(maxW, Math.max(x1, x2)) - x;
  const h = Math.min(maxH, Math.max(y1, y2)) - y;
  if (w < 4 || h < 4) return null;
  return { x, y, w, h };
}

export function mosaicFactor(rect: Rect): number {
  return Math.max(8, Math.round(Math.min(rect.w, rect.h) / 10));
}

export function editorFontSize(imageWidth: number): number {
  return Math.max(20, Math.round(imageWidth / 50));
}

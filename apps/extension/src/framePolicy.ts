export type OverlayMountPlan = "now" | "wait-for-iframe" | "never";

export function overlayMountPlan(isTopFrame: boolean, hasVideo: boolean): OverlayMountPlan {
  if (hasVideo) return "now";
  return isTopFrame ? "wait-for-iframe" : "never";
}

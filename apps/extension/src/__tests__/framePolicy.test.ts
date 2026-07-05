import { describe, expect, it } from "vitest";
import { shouldMountAssistantOverlay } from "../framePolicy";

describe("frame policy", () => {
  it("mounts the overlay in the top frame", () => {
    expect(shouldMountAssistantOverlay(true)).toBe(true);
  });

  it("does not mount duplicate overlays in child frames", () => {
    expect(shouldMountAssistantOverlay(false)).toBe(false);
  });
});

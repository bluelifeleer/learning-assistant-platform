import { describe, expect, it } from "vitest";
import { overlayMountPlan } from "../framePolicy";

describe("frame policy", () => {
  it("mounts immediately in the frame that has the video, even if it is an iframe", () => {
    expect(overlayMountPlan(false, true)).toBe("now");
    expect(overlayMountPlan(true, true)).toBe("now");
  });

  it("lets the top frame wait for an iframe overlay before mounting its own", () => {
    expect(overlayMountPlan(true, false)).toBe("wait-for-iframe");
  });

  it("never mounts in an iframe without a video", () => {
    expect(overlayMountPlan(false, false)).toBe("never");
  });
});

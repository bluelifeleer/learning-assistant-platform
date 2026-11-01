import { describe, expect, it, vi } from "vitest";
import { installScreenshotEditHost, requestScreenshotEditFromTop } from "../screenshotBridge";

describe("screenshot editor bridge", () => {
  it("falls back to the local editor when there is no window", async () => {
    await expect(requestScreenshotEditFromTop("data:image/png;base64,AA==")).resolves.toBeUndefined();
  });

  it("does nothing outside the top frame", () => {
    const addEventListener = vi.fn();
    vi.stubGlobal("window", { top: {}, addEventListener });
    installScreenshotEditHost();
    expect(addEventListener).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

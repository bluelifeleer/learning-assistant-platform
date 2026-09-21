import { describe, expect, it, vi } from "vitest";
import {
  CAPTURE_SCREENSHOT_MESSAGE,
  handleScreenshotCaptureMessage,
  isScreenshotCaptureRequest,
} from "../backgroundScreenshotCapture";

describe("background screenshot capture", () => {
  it("captures the visible tab of the sender window as jpeg", async () => {
    const captureVisibleTab = vi.fn().mockResolvedValue("data:image/jpeg;base64,AAAA");

    const response = await handleScreenshotCaptureMessage(
      { type: CAPTURE_SCREENSHOT_MESSAGE },
      42,
      { captureVisibleTab },
    );

    expect(captureVisibleTab).toHaveBeenCalledWith(42, { format: "jpeg", quality: 70 });
    expect(response).toEqual({ ok: true, dataUrl: "data:image/jpeg;base64,AAAA" });
  });

  it("falls back to the current window when the sender has no tab window id", async () => {
    (globalThis as Record<string, unknown>).chrome = { windows: { WINDOW_ID_CURRENT: -2 } };
    const captureVisibleTab = vi.fn().mockResolvedValue("data:image/jpeg;base64,BBBB");

    const response = await handleScreenshotCaptureMessage(
      { type: CAPTURE_SCREENSHOT_MESSAGE },
      undefined,
      { captureVisibleTab },
    );

    expect(captureVisibleTab).toHaveBeenCalledWith(-2, { format: "jpeg", quality: 70 });
    expect(response).toEqual({ ok: true, dataUrl: "data:image/jpeg;base64,BBBB" });
  });

  it("returns a structured error when capturing fails", async () => {
    const captureVisibleTab = vi.fn().mockRejectedValue(new Error("permission denied"));

    const response = await handleScreenshotCaptureMessage(
      { type: CAPTURE_SCREENSHOT_MESSAGE },
      7,
      { captureVisibleTab },
    );

    expect(response).toEqual({ ok: false, error: "permission denied" });
  });

  it("rejects unsupported messages without capturing", async () => {
    const captureVisibleTab = vi.fn();

    const response = await handleScreenshotCaptureMessage(
      { type: "other-message" },
      7,
      { captureVisibleTab },
    );

    expect(response).toEqual({ ok: false, error: "Unsupported screenshot capture message" });
    expect(captureVisibleTab).not.toHaveBeenCalled();
  });

  it("recognizes only the capture-screenshot message type", () => {
    expect(isScreenshotCaptureRequest({ type: "capture-screenshot" })).toBe(true);
    expect(isScreenshotCaptureRequest({ type: "learning-assistant:fetch-subtitle-file", url: "https://x" })).toBe(false);
    expect(isScreenshotCaptureRequest(null)).toBe(false);
  });
});

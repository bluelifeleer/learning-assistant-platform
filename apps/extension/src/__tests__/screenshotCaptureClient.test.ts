import { describe, expect, it, vi } from "vitest";
import { captureVisibleTabScreenshot } from "../screenshotCaptureClient";

describe("screenshot capture client", () => {
  it("requests the visible tab screenshot from the extension background", async () => {
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      callback({ ok: true, dataUrl: "data:image/jpeg;base64,AAAA" });
    });

    const dataUrl = await captureVisibleTabScreenshot({ sendMessage });

    expect(dataUrl).toBe("data:image/jpeg;base64,AAAA");
    expect(sendMessage).toHaveBeenCalledWith({ type: "capture-screenshot" }, expect.any(Function));
  });

  it("rejects with the background error message when capturing fails", async () => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback({ ok: false, error: "permission denied" });
    });

    await expect(captureVisibleTabScreenshot({ sendMessage })).rejects.toThrow("permission denied");
  });

  it("rejects with a friendly message when the background is unavailable", async () => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback(undefined);
    });

    await expect(captureVisibleTabScreenshot({ sendMessage })).rejects.toThrow("截图服务暂不可用");
  });
});

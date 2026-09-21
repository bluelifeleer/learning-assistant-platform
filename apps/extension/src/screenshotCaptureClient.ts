import {
  CAPTURE_SCREENSHOT_MESSAGE,
  isScreenshotCaptureResponse,
} from "./backgroundScreenshotCapture";

interface RuntimeLike {
  sendMessage(message: unknown, callback: (response: unknown) => void): void;
  lastError?: { message?: string };
}

export function captureVisibleTabScreenshot(
  runtime: RuntimeLike = chrome.runtime,
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      runtime.sendMessage({ type: CAPTURE_SCREENSHOT_MESSAGE }, (response: unknown) => {
        if (!runtime.lastError && isScreenshotCaptureResponse(response)) {
          resolve(response.dataUrl);
          return;
        }
        const error = response && typeof response === "object" && typeof (response as { error?: unknown }).error === "string"
          ? (response as { error: string }).error
          : "截图服务暂不可用，请稍后重试";
        reject(new Error(error));
      });
    } catch {
      reject(new Error("截图服务暂不可用，请稍后重试"));
    }
  });
}

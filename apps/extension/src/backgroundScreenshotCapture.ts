export const CAPTURE_SCREENSHOT_MESSAGE = "capture-screenshot";

export interface ScreenshotCaptureRequest {
  type: typeof CAPTURE_SCREENSHOT_MESSAGE;
}

export type ScreenshotCaptureResponse =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

interface ScreenshotCaptureDependencies {
  captureVisibleTab: (windowId: number, options: chrome.tabs.CaptureVisibleTabOptions) => Promise<string>;
}

export function isScreenshotCaptureRequest(message: unknown): message is ScreenshotCaptureRequest {
  return Boolean(
    message
    && typeof message === "object"
    && (message as { type?: unknown }).type === CAPTURE_SCREENSHOT_MESSAGE,
  );
}

export function isScreenshotCaptureResponse(response: unknown): response is Extract<ScreenshotCaptureResponse, { ok: true }> {
  return Boolean(
    response
    && typeof response === "object"
    && (response as { ok?: unknown }).ok === true
    && typeof (response as { dataUrl?: unknown }).dataUrl === "string",
  );
}

export async function handleScreenshotCaptureMessage(
  message: unknown,
  windowId: number | undefined,
  dependencies: ScreenshotCaptureDependencies = {
    captureVisibleTab: (id, options) => chrome.tabs.captureVisibleTab(id, options),
  },
): Promise<ScreenshotCaptureResponse> {
  if (!isScreenshotCaptureRequest(message)) {
    return { ok: false, error: "Unsupported screenshot capture message" };
  }

  const targetWindowId = windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  try {
    const dataUrl = await dependencies.captureVisibleTab(targetWindowId, { format: "jpeg", quality: 70 });
    return { ok: true, dataUrl };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Screenshot capture failed" };
  }
}

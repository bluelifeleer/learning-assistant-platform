import { ScreenshotEditor } from "./ui/screenshotEditor";

const REQUEST_TYPE = "learning-assistant:screenshot-edit-request";
const RESULT_TYPE = "learning-assistant:screenshot-edit-result";

interface EditRequest {
  type: typeof REQUEST_TYPE;
  requestId: string;
  imageDataUrl: string;
}

interface EditResult {
  type: typeof RESULT_TYPE;
  requestId: string;
  imageDataUrl: string | null;
}

function requestId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * iframe 里的浮层把截图交给顶层页面编辑，避免编辑器被 iframe 尺寸裁切。
 * 顶层没有 content script（例如控制台页）或 2.5 秒无响应时返回 undefined，
 * 调用方回退到 iframe 内的编辑器。
 */
export function requestScreenshotEditFromTop(imageDataUrl: string): Promise<string | null | undefined> {
  if (typeof window === "undefined" || window.top === window || !window.top) {
    return Promise.resolve(undefined);
  }
  const id = requestId();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(undefined);
    }, 2500);
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as Partial<EditResult> | null;
      if (!data || data.type !== RESULT_TYPE || data.requestId !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(typeof data.imageDataUrl === "string" ? data.imageDataUrl : null);
    };
    window.addEventListener("message", onMessage);
    (window.top as Window).postMessage({ type: REQUEST_TYPE, requestId: id, imageDataUrl } satisfies EditRequest, "*");
  });
}

/** 只在顶层页面安装；收到 iframe 请求后用自己的全屏编辑器处理并回传结果。 */
export function installScreenshotEditHost(): void {
  if (typeof window === "undefined" || window.top !== window) return;
  let editing = false;
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as Partial<EditRequest> | null;
    if (!data || data.type !== REQUEST_TYPE || typeof data.requestId !== "string" || typeof data.imageDataUrl !== "string") return;
    const source = event.source as Window | null;
    if (!source) return;
    const respond = (imageDataUrl: string | null): void => {
      const result: EditResult = { type: RESULT_TYPE, requestId: data.requestId!, imageDataUrl };
      try {
        source.postMessage(result, "*");
      } catch {
        // iframe 已关闭
      }
    };
    if (editing) {
      respond(null);
      return;
    }
    editing = true;
    const editor = new ScreenshotEditor({
      imageDataUrl: data.imageDataUrl,
      onCancel: () => {
        editing = false;
        respond(null);
      },
      onSave: async (edited) => {
        editing = false;
        respond(edited);
      },
    });
    editor.mount();
  });
}

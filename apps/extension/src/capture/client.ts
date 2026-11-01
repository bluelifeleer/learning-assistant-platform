const DEFAULT_TIMEOUT_MS = 15000;

export interface CaptureClientOptions {
  apiBaseUrl: string;
  apiToken: string;
  timeoutMs?: number;
}

/** 带 HTTP 状态码的采集请求错误,便于调用方区分 401(token 失效)等情形。 */
export class CaptureRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CaptureRequestError";
  }
}

export class CaptureClient {
  constructor(private readonly options: CaptureClientOptions) {}

  async post(path: string, body: unknown): Promise<void> {
    await this.postJson(path, body);
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let response: Response;
    try {
      response = await fetch(`${this.options.apiBaseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiToken}`,
        },
        body: JSON.stringify(body),
        // 没有超时的话,半开连接会让 fetch 永远不 settle,
        // 浮层的"保存中…"就会一直卡住
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new CaptureRequestError(`Capture request timed out after ${timeoutMs}ms`, 0);
      }
      throw error;
    }
    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { detail?: unknown };
        if (typeof body.detail === "string") detail = body.detail;
      } catch {
        // 非 JSON 错误体，保留状态码文案
      }
      throw new CaptureRequestError(detail || `Capture request failed: ${response.status}`, response.status);
    }
    return (await response.json()) as T;
  }
}

export interface CaptureClientOptions {
  apiBaseUrl: string;
  apiToken: string;
}

export class CaptureClient {
  constructor(private readonly options: CaptureClientOptions) {}

  async post(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${this.options.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Capture request failed: ${response.status}`);
    }
  }
}

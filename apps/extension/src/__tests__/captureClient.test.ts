import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureClient, CaptureRequestError } from "../capture/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CaptureClient", () => {
  it("keeps the server detail so the overlay can show a readable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "LLM 未配置,请先在设置页填写 base_url / api_key / model" }),
    }));
    const client = new CaptureClient({ apiBaseUrl: "http://127.0.0.1:17890/api/v1", apiToken: "t" });

    await expect(client.postJson("/capture/ask", { question: "问" })).rejects.toMatchObject({
      status: 400,
      message: "LLM 未配置,请先在设置页填写 base_url / api_key / model",
    });
  });

  it("falls back to the status text when the error body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new Error("not json"); },
    }));
    const client = new CaptureClient({ apiBaseUrl: "http://127.0.0.1:17890/api/v1", apiToken: "t" });

    await expect(client.postJson("/capture/ask", {})).rejects.toBeInstanceOf(CaptureRequestError);
  });
});

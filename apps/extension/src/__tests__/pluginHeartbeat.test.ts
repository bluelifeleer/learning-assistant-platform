import { describe, expect, it, vi } from "vitest";
import { reportOptionsHeartbeat } from "../pluginHeartbeat";

describe("plugin heartbeat", () => {
  it("reports an options-page heartbeat with the configured token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    await reportOptionsHeartbeat(
      {
        apiBaseUrl: "http://127.0.0.1:17890/api/v1",
        apiToken: "lap_token",
        enabledAdapters: ["wencai-school", "generic-video"],
      },
      { fetch: fetchMock, extensionVersion: "0.1.0" },
    );

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/plugin-heartbeat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer lap_token",
      },
      body: JSON.stringify({
        extension_version: "0.1.0",
        current_url: "extension-options",
        adapter_id: "options",
        adapter_name: "Extension Options",
        enabled_adapters: ["wencai-school", "generic-video"],
      }),
    });
  });
});

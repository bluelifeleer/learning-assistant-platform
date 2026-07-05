import { describe, expect, it } from "vitest";
import { DEFAULT_EXTENSION_CONFIG, normalizeExtensionConfig } from "../config";

describe("extension config", () => {
  it("defaults to local API and common adapters", () => {
    expect(DEFAULT_EXTENSION_CONFIG.apiBaseUrl).toBe("http://127.0.0.1:17890/api/v1");
    expect(DEFAULT_EXTENSION_CONFIG.apiToken).toBe("");
    expect(DEFAULT_EXTENSION_CONFIG.enabledAdapters).toContain("wencai-school");
    expect(DEFAULT_EXTENSION_CONFIG.enabledAdapters).toContain("generic-video");
  });

  it("normalizes partial persisted config", () => {
    const config = normalizeExtensionConfig({ apiBaseUrl: "http://example.test/api", enabledAdapters: ["generic-video"] });

    expect(config.apiBaseUrl).toBe("http://example.test/api");
    expect(config.apiToken).toBe("");
    expect(config.enabledAdapters).toEqual(["generic-video"]);
  });
});

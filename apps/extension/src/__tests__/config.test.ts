import { afterEach, describe, expect, it, vi } from "vitest";
import { adapters } from "../adapters/registry";
import {
  DEFAULT_EXTENSION_CONFIG,
  ensureDefaultExtensionConfig,
  isValidApiBaseUrl,
  normalizeExtensionConfig,
  saveExtensionConfig,
} from "../config";

function stubChromeStorage(stored: Record<string, unknown>) {
  const set = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue(stored),
        set,
      },
    },
  });
  return { set };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extension config", () => {
  it("defaults to local API and enables every registered adapter", () => {
    expect(DEFAULT_EXTENSION_CONFIG.apiBaseUrl).toBe("http://127.0.0.1:17890/api/v1");
    expect(DEFAULT_EXTENSION_CONFIG.apiToken).toBe("");
    expect([...DEFAULT_EXTENSION_CONFIG.enabledAdapters].sort()).toEqual(adapters.map((adapter) => adapter.id).sort());
  });

  it("normalizes partial persisted config", () => {
    const config = normalizeExtensionConfig({ apiBaseUrl: "https://example.test/api", enabledAdapters: ["generic-video"] });

    expect(config.apiBaseUrl).toBe("https://example.test/api");
    expect(config.apiToken).toBe("");
    expect(config.enabledAdapters).toEqual(["generic-video"]);
  });

  it("accepts https and local development api base urls", () => {
    expect(isValidApiBaseUrl("https://api.example.com/v1")).toBe(true);
    expect(isValidApiBaseUrl("http://127.0.0.1:17890/api/v1")).toBe(true);
    expect(isValidApiBaseUrl("http://localhost:17890/api/v1")).toBe(true);
    expect(isValidApiBaseUrl("http://[::1]:17890/api/v1")).toBe(true);
  });

  it("rejects insecure remote api base urls", () => {
    expect(isValidApiBaseUrl("http://example.test/api")).toBe(false);
    expect(isValidApiBaseUrl("ftp://example.test/api")).toBe(false);
    expect(isValidApiBaseUrl("not a url")).toBe(false);
  });

  it("falls back to the default api base url for persisted invalid values", () => {
    const config = normalizeExtensionConfig({ apiBaseUrl: "http://example.test/api" });

    expect(config.apiBaseUrl).toBe(DEFAULT_EXTENSION_CONFIG.apiBaseUrl);
  });

  it("refuses to save an invalid api base url", async () => {
    const { set } = stubChromeStorage({});

    await expect(saveExtensionConfig({
      apiBaseUrl: "http://example.test/api",
      apiToken: "",
      enabledAdapters: ["generic-video"],
    })).rejects.toThrow("https://");
    expect(set).not.toHaveBeenCalled();
  });

  it("saves a valid api base url", async () => {
    const { set } = stubChromeStorage({});

    await saveExtensionConfig({
      apiBaseUrl: "https://api.example.com/v1",
      apiToken: "token",
      enabledAdapters: ["generic-video"],
    });

    expect(set).toHaveBeenCalledWith({
      apiBaseUrl: "https://api.example.com/v1",
      apiToken: "token",
      enabledAdapters: ["generic-video"],
    });
  });
});

describe("default config seeding", () => {
  it("does not overwrite existing settings on install or update", async () => {
    const { set } = stubChromeStorage({
      apiBaseUrl: "https://api.example.com/v1",
      enabledAdapters: ["generic-video"],
    });

    await ensureDefaultExtensionConfig();

    expect(set).not.toHaveBeenCalled();
  });

  it("fills only the missing keys with defaults", async () => {
    const { set } = stubChromeStorage({ apiBaseUrl: "https://api.example.com/v1" });

    await ensureDefaultExtensionConfig();

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ enabledAdapters: DEFAULT_EXTENSION_CONFIG.enabledAdapters });
  });

  it("writes all defaults on a fresh install", async () => {
    const { set } = stubChromeStorage({});

    await ensureDefaultExtensionConfig();

    expect(set).toHaveBeenCalledWith({
      apiBaseUrl: DEFAULT_EXTENSION_CONFIG.apiBaseUrl,
      enabledAdapters: DEFAULT_EXTENSION_CONFIG.enabledAdapters,
    });
  });
});

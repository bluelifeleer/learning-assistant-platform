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

  it("preserves a persisted invalid api base url instead of silently using the default", () => {
    // 旧行为是把非法地址悄悄换成默认地址,等于把用户的 token 发到他没配置过的 host。
    // 现在原样保留,由调用方(content script)判定非法后停止上报。
    const config = normalizeExtensionConfig({ apiBaseUrl: "http://example.test/api" });

    expect(config.apiBaseUrl).toBe("http://example.test/api");
    expect(isValidApiBaseUrl(config.apiBaseUrl)).toBe(false);
  });

  it("treats an explicitly empty adapter list as a deliberate choice", () => {
    // 用户取消勾选全部适配器后保存,不能被默认值覆盖(否则扩展会继续在已关闭的站点采集)
    expect(normalizeExtensionConfig({ enabledAdapters: [] }).enabledAdapters).toEqual([]);

    const { set } = stubChromeStorage({ enabledAdapters: [], apiBaseUrl: "https://example.test/api" });
    return ensureDefaultExtensionConfig().then(() => {
      // 允许补其它缺省项,但绝不能把 enabledAdapters 重置回默认值
      const writtenKeys = set.mock.calls.flatMap(([value]) => Object.keys(value as Record<string, unknown>));
      expect(writtenKeys).not.toContain("enabledAdapters");
    });
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

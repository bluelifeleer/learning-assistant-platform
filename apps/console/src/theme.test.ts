import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  isThemePreference,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
} from "./theme";

describe("theme preference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("only accepts the three known preferences", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference("")).toBe(false);
  });

  it("resolves follow-system from the OS setting and pins explicit choices", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    // 显式选择不受系统影响
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("defaults to follow-system when nothing valid is stored", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    expect(loadThemePreference()).toBe("system");

    vi.stubGlobal("localStorage", {
      getItem: vi.fn().mockReturnValue("blue"),
      setItem: vi.fn(),
    });
    expect(loadThemePreference()).toBe("system");
  });

  it("round-trips a saved preference", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });

    saveThemePreference("dark");
    expect(store.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(loadThemePreference()).toBe("dark");
  });

  it("writes the resolved theme to the root element", () => {
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };

    applyTheme("dark", root as unknown as HTMLElement);
    expect(root.dataset.theme).toBe("dark");
    // 让原生控件也跟着变色
    expect(root.style.colorScheme).toBe("dark");

    applyTheme("light", root as unknown as HTMLElement);
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });
});

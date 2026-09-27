export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "la_theme";

export const THEME_OPTIONS: { id: ThemePreference; label: string; hint: string }[] = [
  { id: "system", label: "跟随系统", hint: "随操作系统的浅色 / 深色设置自动切换" },
  { id: "light", label: "浅色", hint: "始终使用浅色界面" },
  { id: "dark", label: "深色", hint: "始终使用深色界面" },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** 纯函数:把「偏好 + 系统是否深色」解析成实际生效的主题。 */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function loadThemePreference(): ThemePreference {
  if (typeof localStorage === "undefined") return "system";
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(saved) ? saved : "system";
  } catch {
    // 隐私模式等场景读不到,退回默认
    return "system";
  }
}

export function saveThemePreference(preference: ThemePreference): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // 写不进去时当次会话仍然生效,不阻断交互
  }
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 把解析后的主题写到 <html data-theme>,CSS 据此切换变量。 */
export function applyTheme(theme: ResolvedTheme, root?: HTMLElement | null): void {
  const target = root ?? (typeof document === "undefined" ? null : document.documentElement);
  if (!target) return;
  target.dataset.theme = theme;
  // 让滚动条、日期选择器等原生控件也跟着变色
  target.style.colorScheme = theme;
}

/**
 * 在渲染前先应用一次主题(避免刷新时闪白),并返回清理函数。
 * 只有「跟随系统」需要订阅系统配色变化。
 */
export function initTheme(preference: ThemePreference = loadThemePreference()): () => void {
  applyTheme(resolveTheme(preference, systemPrefersDark()));
  if (preference !== "system") return () => undefined;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = (): void => applyTheme(resolveTheme("system", media.matches));
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

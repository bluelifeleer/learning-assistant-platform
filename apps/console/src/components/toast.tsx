import { useSyncExternalStore } from "react";
import { buildRouteHash, type SettingsTab } from "../navSlug";

export type ToastType = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** 毫秒;传 0 表示不自动关闭 */
  duration?: number;
}

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

export const TOAST_DEFAULT_DURATION_MS = 4000;
export const TOAST_ACTION_DURATION_MS = 8000;

export class ToastStore {
  private items: ToastItem[] = [];
  private timers = new Map<number, ReturnType<typeof globalThis.setTimeout>>();
  private listeners = new Set<() => void>();
  private nextId = 1;

  constructor(private defaultDuration: number = TOAST_DEFAULT_DURATION_MS) {}

  getItems = (): ToastItem[] => this.items;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  add(type: ToastType, message: string, options: ToastOptions = {}): number {
    const id = this.nextId++;
    this.items = [...this.items, { id, type, message, action: options.action }];
    // 带操作按钮的 toast 默认停留更久,避免用户来不及点击
    const duration = options.duration ?? (options.action ? TOAST_ACTION_DURATION_MS : this.defaultDuration);
    if (duration > 0) {
      this.timers.set(
        id,
        globalThis.setTimeout(() => this.remove(id), duration),
      );
    }
    this.emit();
    return id;
  }

  remove(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      globalThis.clearTimeout(timer);
      this.timers.delete(id);
    }
    if (!this.items.some((item) => item.id === id)) return;
    this.items = this.items.filter((item) => item.id !== id);
    this.emit();
  }

  clear(): void {
    [...this.items].forEach((item) => this.remove(item.id));
  }
}

export const toastStore = new ToastStore();

/** 函数式全局 API,可在任意组件/回调中直接调用 */
export const toast = {
  success: (message: string, options?: ToastOptions): number => toastStore.add("success", message, options),
  error: (message: string, options?: ToastOptions): number => toastStore.add("error", message, options),
  info: (message: string, options?: ToastOptions): number => toastStore.add("info", message, options),
  dismiss: (id: number): void => toastStore.remove(id),
};

/** 跳到系统设置指定标签页(配合"去配置" action 使用) */
export function goToSettings(tab: SettingsTab = "general"): void {
  if (typeof window === "undefined") return;
  window.location.hash = buildRouteHash("系统设置", { settingsTab: tab });
}

const TOAST_TYPE_ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "i",
};

export function ToastHost({ store = toastStore }: { store?: ToastStore }) {
  const items = useSyncExternalStore(store.subscribe, store.getItems, store.getItems);
  // 始终挂载 host:空态 early return 会导致订阅在部分运行时不触发重渲染
  return (
    <div className="toast-host">
      {items.map((item) => (
        <div key={item.id} className="toast" data-type={item.type} role="alert">
          <span className="toast-icon" aria-hidden="true">{TOAST_TYPE_ICONS[item.type]}</span>
          <p className="toast-message">{item.message}</p>
          {item.action ? (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                item.action?.onClick();
                store.remove(item.id);
              }}
            >
              {item.action.label}
            </button>
          ) : null}
          <button type="button" className="toast-close" aria-label="关闭提示" onClick={() => store.remove(item.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

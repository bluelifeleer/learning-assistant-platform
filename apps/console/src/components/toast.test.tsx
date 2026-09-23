import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastHost, ToastStore, TOAST_DEFAULT_DURATION_MS, toast, toastStore } from "./toast";

describe("ToastStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds toasts with type/message/action and notifies subscribers", () => {
    const store = new ToastStore();
    const seen: number[] = [];
    store.subscribe(() => seen.push(store.getItems().length));

    const action = { label: "去配置", onClick: () => undefined };
    const id = store.add("error", "SMTP 未配置", { action });

    expect(seen).toEqual([1]);
    expect(store.getItems()).toEqual([{ id, type: "error", message: "SMTP 未配置", action }]);
  });

  it("assigns incrementing ids across types", () => {
    const store = new ToastStore();
    const first = store.add("success", "a");
    const second = store.add("info", "b");
    expect(second).toBeGreaterThan(first);
    expect(store.getItems().map((item) => item.type)).toEqual(["success", "info"]);
  });

  it("auto expires toasts after the default duration", () => {
    const store = new ToastStore();
    store.add("success", "已发送");
    expect(store.getItems()).toHaveLength(1);

    vi.advanceTimersByTime(TOAST_DEFAULT_DURATION_MS - 1);
    expect(store.getItems()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(store.getItems()).toHaveLength(0);
  });

  it("supports manual dismiss and cancels the pending timer", () => {
    const store = new ToastStore();
    const id = store.add("info", "提示");
    store.remove(id);
    expect(store.getItems()).toHaveLength(0);

    vi.advanceTimersByTime(TOAST_DEFAULT_DURATION_MS * 2);
    expect(store.getItems()).toHaveLength(0);
  });

  it("keeps toasts without auto dismiss when duration is 0", () => {
    const store = new ToastStore();
    store.add("error", "常驻", { duration: 0 });
    vi.advanceTimersByTime(60000);
    expect(store.getItems()).toHaveLength(1);
  });

  it("honors a custom duration", () => {
    const store = new ToastStore();
    store.add("info", "快", { duration: 500 });
    vi.advanceTimersByTime(500);
    expect(store.getItems()).toHaveLength(0);
  });

  it("clear removes everything", () => {
    const store = new ToastStore();
    store.add("success", "a");
    store.add("error", "b");
    store.clear();
    expect(store.getItems()).toHaveLength(0);
  });
});

describe("toast singleton", () => {
  afterEach(() => {
    toastStore.clear();
  });

  it("exposes functional success/error/info API on the shared store", () => {
    toast.success("ok");
    toast.error("bad");
    toast.info("fyi");
    expect(toastStore.getItems().map((item) => item.type)).toEqual(["success", "error", "info"]);
    toast.dismiss(toastStore.getItems()[0].id);
    expect(toastStore.getItems()).toHaveLength(2);
  });
});

describe("ToastHost", () => {
  it("keeps the host mounted when empty and renders toasts with type and action", () => {
    const empty = new ToastStore();
    const emptyHtml = renderToString(<ToastHost store={empty} />);
    expect(emptyHtml).toContain("toast-host");
    expect(emptyHtml).not.toContain("toast-message");

    const store = new ToastStore();
    store.add("error", "SMTP 未配置", { duration: 0, action: { label: "去配置", onClick: () => undefined } });
    const html = renderToString(<ToastHost store={store} />);
    expect(html).toContain("toast-host");
    expect(html).toContain('data-type="error"');
    expect(html).toContain("SMTP 未配置");
    expect(html).toContain("去配置");
  });
});

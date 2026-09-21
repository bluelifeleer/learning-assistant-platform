import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantOverlay, formatVideoTime } from "../ui/overlay";

type FakeHandler = () => void;

class FakeElement {
  readonly tagName: string;
  children: FakeElement[] = [];
  style: Record<string, string> = {};
  textContent = "";
  value = "";
  id = "";
  type = "";
  disabled = false;
  rows = 0;
  placeholder = "";
  private readonly listeners = new Map<string, FakeHandler[]>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild<T extends FakeElement>(child: T): T {
    this.children.push(child);
    return child;
  }

  removeChild<T extends FakeElement>(child: T): T {
    this.children = this.children.filter((item) => item !== child);
    return child;
  }

  addEventListener(type: string, handler: FakeHandler): void {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  click(): void {
    for (const handler of this.listeners.get("click") ?? []) handler();
  }

  findByText(text: string): FakeElement | undefined {
    return this.children.find((child) => child.textContent === text)
      ?? this.children.map((child) => child.findByText(text)).find(Boolean);
  }
}

function installFakeDocument(): void {
  const fakeDocument = {
    createElement: (tag: string) => new FakeElement(tag),
    getElementById: () => null,
    documentElement: new FakeElement("html"),
  };
  (globalThis as Record<string, unknown>).document = fakeDocument;
}

function overlayRoot(overlay: AssistantOverlay): FakeElement {
  return (overlay as unknown as { root: FakeElement }).root;
}

function overlayStatus(overlay: AssistantOverlay): string {
  return (overlay as unknown as { status: FakeElement }).status.textContent;
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("assistant overlay", () => {
  beforeEach(() => {
    installFakeDocument();
  });

  it("expands a note editor with textarea, save and cancel buttons", () => {
    const overlay = new AssistantOverlay({ onSaveNote: vi.fn().mockResolvedValue(undefined) });
    const root = overlayRoot(overlay);

    root.findByText("添加笔记")?.click();

    const editor = root.children.find((child) => child.tagName === "DIV" && child.children.some((item) => item.tagName === "TEXTAREA"));
    expect(editor).toBeDefined();
    expect(editor?.findByText("保存")).toBeDefined();
    expect(editor?.findByText("取消")).toBeDefined();
  });

  it("collapses the note editor when cancel is clicked", () => {
    const overlay = new AssistantOverlay({ onSaveNote: vi.fn().mockResolvedValue(undefined) });
    const root = overlayRoot(overlay);

    root.findByText("添加笔记")?.click();
    root.findByText("取消")?.click();

    expect(root.findByText("保存")).toBeUndefined();
    expect(root.children.some((child) => child.children.some((item) => item.tagName === "TEXTAREA"))).toBe(false);
  });

  it("disables buttons while saving and shows the saved timestamp on success", async () => {
    let resolveSave: (value: number) => void = () => undefined;
    const onSaveNote = vi.fn().mockImplementation(() => new Promise<number>((resolve) => { resolveSave = resolve; }));
    const overlay = new AssistantOverlay({ onSaveNote });
    const root = overlayRoot(overlay);

    root.findByText("添加笔记")?.click();
    const input = root.children
      .flatMap((child) => child.children)
      .find((child) => child.tagName === "TEXTAREA");
    expect(input).toBeDefined();
    if (input) input.value = "  这里是一个时间点笔记  ";

    const saveButton = root.findByText("保存");
    expect(saveButton).toBeDefined();
    saveButton?.click();

    expect(onSaveNote).toHaveBeenCalledWith("这里是一个时间点笔记");
    expect(saveButton?.disabled).toBe(true);
    expect(saveButton?.textContent).toBe("保存中…");

    resolveSave(754);
    await flushAsync();

    expect(overlayStatus(overlay)).toContain("已保存 12:34");
    expect(root.findByText("保存")).toBeUndefined();
  });

  it("keeps the editor open and shows the error message when saving fails", async () => {
    const onSaveNote = vi.fn().mockRejectedValue(new Error("网络错误"));
    const overlay = new AssistantOverlay({ onSaveNote });
    const root = overlayRoot(overlay);

    root.findByText("添加笔记")?.click();
    const input = root.children
      .flatMap((child) => child.children)
      .find((child) => child.tagName === "TEXTAREA");
    if (input) input.value = "笔记";

    const saveButton = root.findByText("保存");
    saveButton?.click();
    await flushAsync();

    expect(overlayStatus(overlay)).toContain("笔记保存失败：网络错误");
    const restoredSaveButton = root.findByText("保存");
    expect(restoredSaveButton?.disabled).toBe(false);
    expect(root.findByText("取消")?.disabled).toBe(false);
  });

  it("prompts to bind the plugin instead of saving when no onSaveNote callback is injected", () => {
    const overlay = new AssistantOverlay();
    const root = overlayRoot(overlay);

    root.findByText("添加笔记")?.click();

    expect(overlayStatus(overlay)).toContain("请先在扩展选项中完成插件绑定");
    expect(root.children.some((child) => child.children.some((item) => item.tagName === "TEXTAREA"))).toBe(false);
  });

  it("rejects empty note content without calling onSaveNote", () => {
    const onSaveNote = vi.fn().mockResolvedValue(undefined);
    const overlay = new AssistantOverlay({ onSaveNote });
    const root = overlayRoot(overlay);

    root.findByText("添加笔记")?.click();
    root.findByText("保存")?.click();

    expect(onSaveNote).not.toHaveBeenCalled();
    expect(overlayStatus(overlay)).toContain("笔记内容不能为空");
  });

  it("invokes the injected onOpenExports callback from the export button", () => {
    const onOpenExports = vi.fn();
    const overlay = new AssistantOverlay({ onOpenExports, onSaveNote: vi.fn() });
    const root = overlayRoot(overlay);

    root.findByText("导出字幕")?.click();

    expect(onOpenExports).toHaveBeenCalledTimes(1);
  });

  it("disables the screenshot button while capturing and shows the stored timestamp on success", async () => {
    let resolveCapture: (value: number) => void = () => undefined;
    const onCaptureScreenshot = vi.fn().mockImplementation(() => new Promise<number>((resolve) => { resolveCapture = resolve; }));
    const overlay = new AssistantOverlay({ onCaptureScreenshot });
    const root = overlayRoot(overlay);

    const captureButton = root.findByText("截图存证");
    expect(captureButton).toBeDefined();
    captureButton?.click();

    expect(onCaptureScreenshot).toHaveBeenCalledTimes(1);
    expect(captureButton?.disabled).toBe(true);
    expect(captureButton?.textContent).toBe("截图中…");

    resolveCapture(754);
    await flushAsync();

    expect(overlayStatus(overlay)).toContain("已存证 12:34");
    expect(captureButton?.disabled).toBe(false);
    expect(captureButton?.textContent).toBe("截图存证");
  });

  it("shows the error message when the screenshot capture fails", async () => {
    const onCaptureScreenshot = vi.fn().mockRejectedValue(new Error("课程尚未采集，请先在课程页面停留片刻后重试"));
    const overlay = new AssistantOverlay({ onCaptureScreenshot });
    const root = overlayRoot(overlay);

    const captureButton = root.findByText("截图存证");
    captureButton?.click();
    await flushAsync();

    expect(overlayStatus(overlay)).toContain("截图存证失败：课程尚未采集，请先在课程页面停留片刻后重试");
    expect(captureButton?.disabled).toBe(false);
    expect(captureButton?.textContent).toBe("截图存证");
  });

  it("prompts to bind the plugin instead of capturing when no onCaptureScreenshot callback is injected", () => {
    const overlay = new AssistantOverlay();
    const root = overlayRoot(overlay);

    root.findByText("截图存证")?.click();

    expect(overlayStatus(overlay)).toContain("请先在扩展选项中完成插件绑定");
  });
});

describe("formatVideoTime", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatVideoTime(0)).toBe("00:00");
    expect(formatVideoTime(754)).toBe("12:34");
    expect(formatVideoTime(59.6)).toBe("01:00");
  });

  it("formats durations over an hour as h:mm:ss", () => {
    expect(formatVideoTime(3661)).toBe("1:01:01");
  });
});

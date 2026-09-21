import { assertAssistantOnlyElement } from "../safety/guardrails";

export interface OverlayState {
  adapterName: string;
  courseTitle?: string;
  chapterTitle?: string;
  status: string;
}

export interface AssistantOverlayCallbacks {
  onSaveNote?: (content: string) => Promise<number | undefined>;
  onOpenExports?: () => void;
  onCaptureScreenshot?: () => Promise<number | undefined>;
}

export const ASSISTANT_OVERLAY_ACTIONS = [
  { label: "添加笔记" },
  { label: "导出字幕" },
  { label: "截图存证" },
] as const;

export function formatVideoTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const restSeconds = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

export class AssistantOverlay {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly callbacks: AssistantOverlayCallbacks;
  private noteEditor: HTMLDivElement | null = null;
  private noteInput: HTMLTextAreaElement | null = null;
  private noteSaveButton: HTMLButtonElement | null = null;
  private noteCancelButton: HTMLButtonElement | null = null;
  private savingNote = false;
  private readonly screenshotButton: HTMLButtonElement;
  private capturingScreenshot = false;

  constructor(callbacks: AssistantOverlayCallbacks = {}) {
    this.callbacks = callbacks;
    this.root = document.createElement("div");
    this.root.id = "learning-assistant-overlay";
    this.root.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "width:280px",
      "font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "background:#101820",
      "color:#f4f7fb",
      "border:1px solid #31465c",
      "border-radius:8px",
      "box-shadow:0 12px 32px rgba(0,0,0,.28)",
      "padding:12px",
    ].join(";");

    this.status = document.createElement("div");
    this.root.appendChild(this.status);
    this.root.appendChild(this.makeButton("添加笔记", () => this.toggleNoteEditor()));
    this.root.appendChild(this.makeButton("导出字幕", () => this.openExports()));
    this.screenshotButton = this.makeButton("截图存证", () => { void this.captureScreenshot(); });
    this.root.appendChild(this.screenshotButton);
  }

  mount(): void {
    if (!document.getElementById(this.root.id)) {
      document.documentElement.appendChild(this.root);
    }
  }

  unmount(): void {
    this.root.remove();
  }

  update(state: Partial<OverlayState>): void {
    const lines = [
      "学习助手",
      state.adapterName ? `适配器: ${state.adapterName}` : null,
      state.courseTitle ? `课程: ${state.courseTitle}` : null,
      state.chapterTitle ? `章节: ${state.chapterTitle}` : null,
      `状态: ${state.status ?? "待连接"}`,
    ].filter(Boolean);
    this.status.textContent = lines.join("\n");
    this.status.style.whiteSpace = "pre-line";
  }

  remindManualSave(): void {
    this.update({ status: "视频已结束，请手动点击平台的保存学习进度按钮" });
  }

  private openExports(): void {
    if (!this.callbacks.onOpenExports) {
      this.update({ status: "导出字幕入口未配置" });
      return;
    }
    this.callbacks.onOpenExports();
  }

  private async captureScreenshot(): Promise<void> {
    if (!this.callbacks.onCaptureScreenshot) {
      this.update({ status: "请先在扩展选项中完成插件绑定，再截图存证" });
      return;
    }
    if (this.capturingScreenshot) return;
    this.capturingScreenshot = true;
    this.screenshotButton.disabled = true;
    this.screenshotButton.textContent = "截图中…";
    try {
      const seconds = await this.callbacks.onCaptureScreenshot();
      this.update({ status: seconds === undefined ? "截图已存证" : `已存证 ${formatVideoTime(seconds)}` });
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "请稍后重试";
      this.update({ status: `截图存证失败：${message}` });
    } finally {
      this.capturingScreenshot = false;
      this.screenshotButton.disabled = false;
      this.screenshotButton.textContent = "截图存证";
    }
  }

  private toggleNoteEditor(): void {
    if (!this.callbacks.onSaveNote) {
      this.update({ status: "请先在扩展选项中完成插件绑定，再添加笔记" });
      return;
    }
    if (this.noteEditor) {
      this.closeNoteEditor();
      return;
    }
    const editor = document.createElement("div");
    const input = document.createElement("textarea");
    input.rows = 3;
    input.placeholder = "记录当前视频时间点的笔记…";
    input.style.cssText = "box-sizing:border-box;width:100%;margin-top:8px;padding:6px;border-radius:6px;border:1px solid #31465c;background:#0b1220;color:#f4f7fb;font:inherit;resize:vertical";
    editor.appendChild(input);
    this.noteSaveButton = this.makeButton("保存", () => { void this.saveNote(); });
    this.noteCancelButton = this.makeButton("取消", () => this.closeNoteEditor(), "#31465c");
    editor.appendChild(this.noteSaveButton);
    editor.appendChild(this.noteCancelButton);
    this.root.appendChild(editor);
    this.noteEditor = editor;
    this.noteInput = input;
  }

  private closeNoteEditor(): void {
    if (this.noteEditor) {
      this.root.removeChild(this.noteEditor);
    }
    this.noteEditor = null;
    this.noteInput = null;
    this.noteSaveButton = null;
    this.noteCancelButton = null;
  }

  private async saveNote(): Promise<void> {
    if (!this.callbacks.onSaveNote || this.savingNote || !this.noteInput) return;
    const content = this.noteInput.value.trim();
    if (!content) {
      this.update({ status: "笔记内容不能为空" });
      return;
    }
    const saveButton = this.noteSaveButton;
    const cancelButton = this.noteCancelButton;
    this.savingNote = true;
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "保存中…";
    }
    if (cancelButton) cancelButton.disabled = true;
    try {
      const seconds = await this.callbacks.onSaveNote(content);
      this.update({ status: seconds === undefined ? "笔记已保存" : `已保存 ${formatVideoTime(seconds)}` });
      this.closeNoteEditor();
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "请稍后重试";
      this.update({ status: `笔记保存失败：${message}` });
    } finally {
      this.savingNote = false;
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = "保存";
      }
      if (cancelButton) cancelButton.disabled = false;
    }
  }

  private makeButton(label: string, onClick: () => void, background = "#1f8fff"): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `margin:8px 6px 0 0;padding:6px 8px;border-radius:6px;border:0;background:${background};color:white;cursor:pointer`;
    assertAssistantOnlyElement(button);
    button.addEventListener("click", onClick);
    return button;
  }
}

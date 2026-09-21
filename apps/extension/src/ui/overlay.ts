import { assertAssistantOnlyElement } from "../safety/guardrails";

export interface OverlayState {
  adapterName: string;
  courseTitle?: string;
  chapterTitle?: string;
  status: string;
}

export const OVERLAY_NOTE_TAGS = ["考点", "高频", "普通", "简答", "多选", "单选"];

export interface AssistantOverlayCallbacks {
  onSaveNote?: (content: string, tags: string[]) => Promise<number | undefined>;
  onOpenExports?: () => void;
  onCaptureScreenshot?: () => Promise<number | undefined>;
  onUploadNoteImage?: (imageBase64: string) => Promise<string>;
}

export const ASSISTANT_OVERLAY_ACTIONS = [
  { label: "添加笔记" },
  { label: "导出字幕" },
  { label: "截图存证" },
] as const;

const COLLAPSED_STORAGE_KEY = "learning-assistant:overlay-collapsed";

export function noteImageMarkdown(imageId: string): string {
  return `![图片](note-image:${imageId})`;
}

export function insertSnippetAtCursor(value: string, selectionStart: number | undefined, snippet: string): string {
  const at = typeof selectionStart === "number" && selectionStart >= 0 && selectionStart <= value.length
    ? selectionStart
    : value.length;
  const before = value.slice(0, at);
  const after = value.slice(at);
  const prefix = before && !before.endsWith("\n") ? "\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n" : "";
  return `${before}${prefix}${snippet}${suffix}${after}`;
}

function waitForRepaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    } else {
      resolve();
    }
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

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
  private readonly body: HTMLDivElement;
  private readonly mini: HTMLButtonElement;
  private readonly status: HTMLDivElement;
  private readonly callbacks: AssistantOverlayCallbacks;
  private collapsed = false;
  private noteModal: HTMLDivElement | null = null;
  private noteInput: HTMLTextAreaElement | null = null;
  private noteSaveButton: HTMLButtonElement | null = null;
  private noteCancelButton: HTMLButtonElement | null = null;
  private noteUploadButton: HTMLButtonElement | null = null;
  private noteFileInput: HTMLInputElement | null = null;
  private noteTags: string[] = [];
  private savingNote = false;
  private uploadingImage = false;
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
      "padding:0 0 12px",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:10px 12px 0";
    const title = document.createElement("span");
    title.textContent = "学习助手";
    title.style.fontWeight = "600";
    const collapseButton = this.makeButton("—", () => this.setCollapsed(true), "#31465c");
    collapseButton.title = "收缩为图标";
    collapseButton.style.margin = "0";
    collapseButton.style.padding = "2px 8px";
    header.appendChild(title);
    header.appendChild(collapseButton);
    this.root.appendChild(header);

    this.body = document.createElement("div");
    this.body.style.cssText = "padding:0 12px";
    this.status = document.createElement("div");
    this.status.style.marginTop = "6px";
    this.body.appendChild(this.status);
    this.body.appendChild(this.makeButton("添加笔记", () => this.toggleNoteEditor()));
    this.body.appendChild(this.makeButton("导出字幕", () => this.openExports()));
    this.screenshotButton = this.makeButton("截图存证", () => { void this.captureScreenshot(); });
    this.body.appendChild(this.screenshotButton);
    this.root.appendChild(this.body);

    this.mini = this.makeButton("LA", () => this.setCollapsed(false));
    this.mini.id = "learning-assistant-overlay-mini";
    this.mini.title = "展开学习助手";
    this.mini.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "width:44px",
      "height:44px",
      "border-radius:50%",
      "border:1px solid #31465c",
      "background:#1f8fff",
      "color:#fff",
      "font:700 14px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "cursor:pointer",
      "box-shadow:0 8px 20px rgba(0,0,0,.3)",
    ].join(";");
    this.mini.style.display = "none";
  }

  mount(): void {
    // 扩展 reload 后旧浮层 DOM 仍残留在页面里但已失效,重新注入时直接移除替换
    document.getElementById(this.root.id)?.remove();
    document.getElementById(this.mini.id)?.remove();
    document.documentElement.appendChild(this.root);
    document.documentElement.appendChild(this.mini);
    this.applyCollapsed(this.readCollapsedPreference());
  }

  unmount(): void {
    this.root.remove();
    this.mini.remove();
  }

  setCollapsed(collapsed: boolean): void {
    this.applyCollapsed(collapsed);
    try {
      globalThis.localStorage?.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // 页面禁用 localStorage 时保持单次会话内状态即可
    }
  }

  private applyCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.root.style.display = collapsed ? "none" : "";
    this.mini.style.display = collapsed ? "" : "none";
  }

  private readCollapsedPreference(): boolean {
    try {
      return globalThis.localStorage?.getItem(COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  update(state: Partial<OverlayState>): void {
    const lines = [
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
    // 截的是整个标签页画面,先隐藏浮层并等待重绘,避免浮层本身出现在存证截图里
    this.root.style.display = "none";
    await waitForRepaint();
    try {
      const seconds = await this.callbacks.onCaptureScreenshot();
      this.applyCollapsed(this.collapsed);
      this.update({ status: seconds === undefined ? "截图已存证" : `已存证 ${formatVideoTime(seconds)}` });
    } catch (error) {
      this.applyCollapsed(this.collapsed);
      const message = error instanceof Error && error.message ? error.message : "请稍后重试";
      this.update({ status: `截图存证失败：${message}` });
    } finally {
      this.applyCollapsed(this.collapsed);
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
    if (this.noteModal) {
      this.closeNoteEditor();
      return;
    }
    this.openNoteModal();
  }

  private openNoteModal(): void {
    const modal = document.createElement("div");
    modal.id = "learning-assistant-note-modal";
    modal.style.cssText = [
      "position:fixed",
      "left:50%",
      "top:18%",
      "transform:translateX(-50%)",
      "width:380px",
      "max-width:90vw",
      "background:#101820",
      "border:1px solid #31465c",
      "border-radius:10px",
      "box-shadow:0 16px 44px rgba(0,0,0,.45)",
      "z-index:2147483647",
    ].join(";");

    const header = document.createElement("div");
    header.textContent = "添加笔记（按住此栏可拖动）";
    header.style.cssText = "cursor:move;user-select:none;padding:10px 12px;border-bottom:1px solid #31465c;font-weight:600";
    this.enableDrag(header, modal);
    modal.appendChild(header);

    const body = document.createElement("div");
    body.style.cssText = "padding:10px 12px";
    const input = document.createElement("textarea");
    input.rows = 6;
    input.placeholder = "记录当前视频时间点的笔记，可直接粘贴图片…";
    input.style.cssText = "box-sizing:border-box;width:100%;padding:8px;border-radius:6px;border:1px solid #31465c;background:#0b1220;color:#f4f7fb;font:inherit;resize:vertical";
    input.addEventListener("paste", (event: ClipboardEvent) => this.handleNotePaste(event));
    body.appendChild(input);

    const toolbar = document.createElement("div");
    toolbar.style.cssText = "margin-top:8px";
    this.noteUploadButton = this.makeButton("插入图片", () => this.noteFileInput?.click(), "#31465c");
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) void this.uploadAndInsertImage(file);
      fileInput.value = "";
    });
    toolbar.appendChild(this.noteUploadButton);
    toolbar.appendChild(fileInput);
    this.noteFileInput = fileInput;
    body.appendChild(toolbar);

    const tagRow = document.createElement("div");
    tagRow.style.cssText = "margin-top:8px;display:flex;gap:6px;flex-wrap:wrap";
    for (const tag of OVERLAY_NOTE_TAGS) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = tag;
      assertAssistantOnlyElement(chip);
      const paint = () => {
        const active = this.noteTags.includes(tag);
        chip.style.cssText = `padding:3px 10px;border-radius:999px;border:1px solid ${active ? "#1f8fff" : "#31465c"};background:${active ? "#1f8fff" : "transparent"};color:${active ? "#fff" : "#9fb3c8"};cursor:pointer;font-size:12px`;
      };
      paint();
      chip.addEventListener("click", () => {
        this.noteTags = this.noteTags.includes(tag)
          ? this.noteTags.filter((item) => item !== tag)
          : [...this.noteTags, tag];
        paint();
      });
      tagRow.appendChild(chip);
    }
    body.appendChild(tagRow);
    modal.appendChild(body);

    const footer = document.createElement("div");
    footer.style.cssText = "padding:0 12px 12px";
    this.noteSaveButton = this.makeButton("保存", () => { void this.saveNote(); });
    this.noteCancelButton = this.makeButton("取消", () => this.closeNoteEditor(), "#31465c");
    footer.appendChild(this.noteSaveButton);
    footer.appendChild(this.noteCancelButton);
    modal.appendChild(footer);

    this.root.appendChild(modal);
    this.noteModal = modal;
    this.noteInput = input;
    input.focus?.();
  }

  private enableDrag(handle: HTMLElement, modal: HTMLElement): void {
    handle.addEventListener("mousedown", (event: MouseEvent) => {
      event.preventDefault();
      const rect = modal.getBoundingClientRect();
      modal.style.transform = "";
      modal.style.left = `${rect.left}px`;
      modal.style.top = `${rect.top}px`;
      const startX = event.clientX;
      const startY = event.clientY;
      const baseLeft = rect.left;
      const baseTop = rect.top;
      const onMove = (move: MouseEvent) => {
        modal.style.left = `${baseLeft + move.clientX - startX}px`;
        modal.style.top = `${baseTop + move.clientY - startY}px`;
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  private handleNotePaste(event: ClipboardEvent): void {
    const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void this.uploadAndInsertImage(file);
  }

  private async uploadAndInsertImage(file: File): Promise<void> {
    if (!this.callbacks.onUploadNoteImage || !this.noteInput) {
      this.update({ status: "当前配置不支持上传图片" });
      return;
    }
    if (this.uploadingImage) return;
    this.uploadingImage = true;
    if (this.noteUploadButton) {
      this.noteUploadButton.disabled = true;
      this.noteUploadButton.textContent = "上传中…";
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const imageId = await this.callbacks.onUploadNoteImage(dataUrl);
      if (this.noteInput) {
        this.noteInput.value = insertSnippetAtCursor(this.noteInput.value, this.noteInput.selectionStart, noteImageMarkdown(imageId));
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "请稍后重试";
      this.update({ status: `图片上传失败：${message}` });
    } finally {
      this.uploadingImage = false;
      if (this.noteUploadButton) {
        this.noteUploadButton.disabled = false;
        this.noteUploadButton.textContent = "插入图片";
      }
    }
  }

  private closeNoteEditor(): void {
    if (this.noteModal) {
      this.root.removeChild(this.noteModal);
    }
    this.noteModal = null;
    this.noteInput = null;
    this.noteSaveButton = null;
    this.noteCancelButton = null;
    this.noteUploadButton = null;
    this.noteFileInput = null;
    this.noteTags = [];
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
      const seconds = await this.callbacks.onSaveNote(content, [...this.noteTags]);
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

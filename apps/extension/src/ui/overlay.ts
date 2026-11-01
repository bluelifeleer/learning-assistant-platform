import { assertAssistantOnlyElement } from "../safety/guardrails";
import { ScreenshotEditor } from "./screenshotEditor";

export interface OverlayState {
  adapterName: string;
  courseTitle?: string;
  chapterTitle?: string;
  status: string;
  /** 当前屏幕上的字幕,用于浮层展示与"记下这句" */
  transcript?: string;
  /** 视频当前秒数 */
  timeSeconds?: number;
  /** 当前课程/章节的稳定标识,用于按章节保存笔记草稿 */
  draftKey?: string;
  /** 上次播放位置;有值时浮层显示「继续上次」 */
  continueSeconds?: number;
  /** 本地待补传的采集数量 */
  pendingCaptures?: number;
  /** 当前字幕的译文（双语模式） */
  translation?: string;
}

export const OVERLAY_NOTE_TAGS = ["考点", "高频", "疑问", "普通", "简答", "多选", "单选"];

const NOTE_TEMPLATES = [
  { value: "qa", label: "问题-结论-例子", text: "## 问题\n\n\n## 结论\n\n\n## 例子\n" },
  { value: "definition", label: "定义-易错点", text: "## 定义\n\n\n## 易错点\n" },
  { value: "summary", label: "本节要点", text: "## 本节要点\n- \n- \n" },
] as const;

export interface NoteSaveOptions {
  /** 划词/字幕引用的原文,后端会以引用块存在笔记里 */
  sourceText?: string;
  /** 保存后立即生成复习卡 */
  addToReview?: boolean;
}

export interface NoteSaveResult {
  seconds?: number;
  noteId?: string;
  reviewCreated?: boolean;
  reviewError?: string;
  /** 网络不可用时已写入本地队列，联网后自动补传 */
  queued?: boolean;
}

export interface NoteEditorOptions {
  content?: string;
  sourceText?: string;
  tags?: string[];
  addToReview?: boolean;
}

export interface ScreenshotCaptureResult {
  imageBase64: string;
  videoTimeSeconds?: number;
}

export interface ScreenshotSaveResult {
  seconds?: number;
  queued?: boolean;
}

export interface AskCitation {
  chapter_title: string;
  start_seconds?: number | null;
  excerpt: string;
}

export interface AskResult {
  answer: string;
  citations: AskCitation[];
}

export interface AssistantOverlayCallbacks {
  onSaveNote?: (content: string, tags: string[], options?: NoteSaveOptions) => Promise<NoteSaveResult | number | undefined>;
  onOpenExports?: () => void;
  /** 旧接口:截图并直接上传,返回视频时间点 */
  onCaptureScreenshot?: () => Promise<number | undefined>;
  /** 新接口:只截图,交给浮层内编辑器裁剪/打码 */
  onCaptureScreenshotImage?: () => Promise<ScreenshotCaptureResult>;
  /** 新接口:把编辑后的 dataURL 上传 */
  onSaveScreenshot?: (imageBase64: string, videoTimeSeconds?: number) => Promise<ScreenshotSaveResult | number | undefined>;
  onUploadNoteImage?: (imageBase64: string) => Promise<string>;
  /** 浮层内 AI 问答:按当前课程/章节检索字幕并生成回答 */
  onAsk?: (question: string) => Promise<AskResult>;
  /** 用户点「继续上次」时把视频定位到该秒数(不自动播放) */
  onContinue?: (seconds: number) => void;
  /**
   * iframe 场景把截图交给顶层编辑。返回 string=已编辑、null=取消、
   * undefined=顶层不可用，由浮层自己打开本地编辑器。
   */
  onRequestScreenshotEditor?: (imageDataUrl: string) => Promise<string | null | undefined>;
  /** 双语字幕翻译，target 由字幕语言自动决定 */
  onTranslate?: (text: string, target: "zh" | "en") => Promise<string>;
}

export const OVERLAY_POSITION_KEY = "learning-assistant:overlay-position";
export const OVERLAY_OPACITY_KEY = "learning-assistant:overlay-opacity";
export const OVERLAY_OPACITY_STEPS = [1, 0.85, 0.7] as const;

export interface OverlayPosition {
  left: number;
  top: number;
}

/** 拖动后把浮层夹在视口内,避免拖到屏幕外找不回来。 */
export function clampOverlayPosition(
  left: number,
  top: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): OverlayPosition {
  const margin = 8;
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const maxTop = Math.max(margin, viewportHeight - height - margin);
  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  };
}

/** 100% → 85% → 70% → 100% 循环。 */
export function nextOverlayOpacity(current: number): number {
  const index = OVERLAY_OPACITY_STEPS.findIndex((step) => Math.abs(step - current) < 0.01);
  return OVERLAY_OPACITY_STEPS[(index + 1) % OVERLAY_OPACITY_STEPS.length];
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

/** 根据字幕语言选择翻译目标:中文 → 英文,其它 → 中文。 */
export function translationTarget(text: string): "zh" | "en" {
  return /[\u4e00-\u9fff]/.test(text) ? "en" : "zh";
}

export function translationPrompt(text: string): string {
  return translationTarget(text) === "en"
    ? `请把这句话翻译成英文：${text}`
    : `请把这句话翻译成中文：${text}`;
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
  private readonly meta: HTMLDivElement;
  private readonly opacityButton: HTMLButtonElement;
  private readonly callbacks: AssistantOverlayCallbacks;
  private collapsed = false;
  private currentState: OverlayState = { adapterName: "", status: "待连接" };
  private position: OverlayPosition | null = null;
  private opacity = 1;
  private noteModal: HTMLDivElement | null = null;
  private noteInput: HTMLTextAreaElement | null = null;
  private noteSaveButton: HTMLButtonElement | null = null;
  private noteCancelButton: HTMLButtonElement | null = null;
  private noteUploadButton: HTMLButtonElement | null = null;
  private noteFileInput: HTMLInputElement | null = null;
  private noteTags: string[] = [];
  private noteContext: NoteSaveOptions = {};
  private noteAddToReview = false;
  private noteQuote: HTMLDivElement | null = null;
  private noteReviewCheckbox: HTMLInputElement | null = null;
  private savingNote = false;
  private readonly noteEscapeHandler = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    this.closeNoteEditor();
  };
  private uploadingImage = false;
  private readonly screenshotButton: HTMLButtonElement;
  private readonly continueButton: HTMLButtonElement;
  private readonly bilingualBox: HTMLDivElement;
  private readonly bilingualOriginal: HTMLDivElement;
  private readonly bilingualTranslation: HTMLDivElement;
  private readonly bilingualButton: HTMLButtonElement;
  private bilingual = false;
  private translationTimer: number | undefined;
  private translationRequestId = 0;
  private lastTranslatedTranscript = "";
  private readonly sessionLine: HTMLDivElement;
  private watchedSeconds = 0;
  private sessionNotes = 0;
  private sessionScreenshots = 0;
  private sessionReviews = 0;
  private sessionQuestions = 0;
  private sessionTimer: number | undefined;
  private draftTimer: number | undefined;
  private summaryModal: HTMLDivElement | null = null;
  private summaryStatus: HTMLDivElement | null = null;
  private readonly summaryEscapeHandler = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    this.closeSessionSummary();
  };
  private askModal: HTMLDivElement | null = null;
  private askInput: HTMLTextAreaElement | null = null;
  private askAnswer: HTMLDivElement | null = null;
  private askCitations: HTMLDivElement | null = null;
  private askStatus: HTMLDivElement | null = null;
  private askButton: HTMLButtonElement | null = null;
  private askNoteButton: HTMLButtonElement | null = null;
  private asking = false;
  private voiceButton: HTMLButtonElement | null = null;
  private voiceRecognition: { stop: () => void; start: () => void } | null = null;
  private readonly askEscapeHandler = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    this.closeAskDialog();
  };
  private capturingScreenshot = false;
  private readonly onWindowResize = (): void => this.applyStoredPosition();
  private screenshotEditorOpen = false;

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
      "max-width:calc(100vw - 32px)",
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
    // 页面全局 CSS 可能直接重置 span/button 的字号和颜色,关键文字全部内联显式声明
    title.style.cssText = "font-size:13px;font-weight:600;color:#f4f7fb;line-height:1.4";
    this.opacityButton = this.makeButton("◐", () => this.cycleOpacity(), "#31465c");
    this.opacityButton.title = "透明度";
    this.opacityButton.style.margin = "0 6px 0 0";
    this.opacityButton.style.padding = "2px 8px";
    const collapseButton = this.makeButton("—", () => this.setCollapsed(true), "#31465c");
    collapseButton.title = "收起（Alt+H）";
    collapseButton.style.margin = "0";
    collapseButton.style.padding = "2px 8px";
    header.appendChild(title);
    header.appendChild(this.opacityButton);
    header.appendChild(collapseButton);
    this.enableRootDrag(header);
    this.root.appendChild(header);

    this.body = document.createElement("div");
    this.body.style.cssText = "padding:0 12px";
    this.status = document.createElement("div");
    this.status.style.cssText = "margin-top:6px;font-size:13px;color:#f4f7fb;line-height:1.4";
    this.body.appendChild(this.status);

    this.meta = document.createElement("div");
    this.meta.style.cssText = "margin-top:6px;font-size:12px;color:#9fb3c8;line-height:1.45;display:none;cursor:pointer";
    this.meta.addEventListener("click", () => {
      if (this.currentState.transcript) this.openNoteEditor({ sourceText: this.currentState.transcript });
    });
    this.body.appendChild(this.meta);

    this.bilingualBox = document.createElement("div");
    this.bilingualBox.id = "learning-assistant-bilingual";
    this.bilingualBox.style.cssText = "margin-top:6px;display:none;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;line-height:1.5;color:#9fb3c8";
    const originalColumn = document.createElement("div");
    originalColumn.style.cssText = "min-width:0;background:#0b1220;border-left:2px solid #1f8fff;border-radius:0 6px 6px 0;padding:6px 8px";
    const originalLabel = document.createElement("div");
    originalLabel.textContent = "原文";
    originalLabel.style.cssText = "font-size:10px;color:#7b8ba4;margin-bottom:2px";
    this.bilingualOriginal = document.createElement("div");
    this.bilingualOriginal.style.cssText = "white-space:pre-wrap;max-height:74px;overflow:auto;cursor:pointer";
    this.bilingualOriginal.title = "点击记下这句";
    this.bilingualOriginal.addEventListener("click", () => {
      if (this.currentState.transcript) this.openNoteEditor({ sourceText: this.currentState.transcript });
    });
    originalColumn.appendChild(originalLabel);
    originalColumn.appendChild(this.bilingualOriginal);
    const translationColumn = document.createElement("div");
    translationColumn.style.cssText = "min-width:0;background:#0b1220;border-left:2px solid #38bdf8;border-radius:0 6px 6px 0;padding:6px 8px";
    const translationLabel = document.createElement("div");
    translationLabel.textContent = "译文";
    translationLabel.style.cssText = "font-size:10px;color:#7b8ba4;margin-bottom:2px";
    this.bilingualTranslation = document.createElement("div");
    this.bilingualTranslation.style.cssText = "white-space:pre-wrap;max-height:74px;overflow:auto";
    translationColumn.appendChild(translationLabel);
    translationColumn.appendChild(this.bilingualTranslation);
    this.bilingualBox.appendChild(originalColumn);
    this.bilingualBox.appendChild(translationColumn);
    this.body.appendChild(this.bilingualBox);

    this.continueButton = this.makeButton("继续上次", () => {
      if (this.currentState.continueSeconds !== undefined) {
        this.callbacks.onContinue?.(this.currentState.continueSeconds);
      }
    }, "#31465c");
    this.continueButton.style.display = "none";
    this.continueButton.title = "跳到上次播放位置（只定位，不自动播放）";
    this.body.appendChild(this.continueButton);

    this.sessionLine = document.createElement("div");
    this.sessionLine.id = "learning-assistant-session-line";
    this.sessionLine.style.cssText = "margin-top:8px;font-size:11px;color:#7b8ba4;line-height:1.4;cursor:pointer";
    this.sessionLine.title = "查看本次学习小结";
    this.sessionLine.addEventListener("click", () => this.openSessionSummary());
    this.body.appendChild(this.sessionLine);

    const noteButton = this.makeButton("添加笔记", () => this.toggleNoteEditor());
    noteButton.title = "记录当前时间点的笔记（Alt+N）";
    this.body.appendChild(noteButton);
    const questionButton = this.makeButton("标记疑问", () => this.openQuestionNote(), "#31465c");
    questionButton.title = "把当前这句记成待解决的疑问（Alt+Q）";
    this.body.appendChild(questionButton);
    const reviewButton = this.makeButton("加入复习", () => this.openReviewNote(), "#31465c");
    reviewButton.title = "写下要复习的内容并生成复习卡（Alt+R）";
    this.body.appendChild(reviewButton);
    this.bilingualButton = this.makeButton("双语", () => this.setBilingual(!this.bilingual), "#31465c");
    this.bilingualButton.title = "并排显示当前字幕的原文和译文";
    this.body.appendChild(this.bilingualButton);
    const askButton = this.makeButton("AI 解释", () => this.openAskFromTranscript(), "#31465c");
    askButton.title = "用 AI 解释当前字幕，也可以继续追问（Alt+A）";
    this.body.appendChild(askButton);
    this.screenshotButton = this.makeButton("截图存证", () => { void this.captureScreenshot(); });
    this.screenshotButton.title = "截取当前画面并存证（Alt+S）";
    this.body.appendChild(this.screenshotButton);
    const exportButton = this.makeButton("导出字幕", () => this.openExports(), "#31465c");
    this.body.appendChild(exportButton);
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
    this.applyOpacity(this.readOpacity());
    this.position = this.readPosition();
    this.applyStoredPosition();
    this.renderSession();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.onWindowResize);
      this.sessionTimer = window.setInterval(() => this.renderSession(), 60_000);
    }
  }

  unmount(): void {
    this.root.remove();
    this.mini.remove();
    if (this.translationTimer !== undefined && typeof window !== "undefined") {
      window.clearTimeout(this.translationTimer);
      this.translationTimer = undefined;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.onWindowResize);
      if (this.sessionTimer !== undefined) window.clearInterval(this.sessionTimer);
      this.sessionTimer = undefined;
    }
  }

  /** 内容脚本在播放期间累计实际观看秒数;暂停/切后台不计入。 */
  addWatchedSeconds(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.watchedSeconds += seconds;
    this.renderSession();
  }

  private sessionMinutes(): number {
    if (this.watchedSeconds <= 0) return 0;
    return Math.max(1, Math.round(this.watchedSeconds / 60));
  }

  private renderSession(): void {
    if (!this.sessionLine) return;
    const minutes = this.sessionMinutes();
    const parts = [`本次 ${minutes} 分钟`];
    if (this.sessionNotes) parts.push(`笔记 ${this.sessionNotes}`);
    if (this.sessionQuestions) parts.push(`疑问 ${this.sessionQuestions}`);
    if (this.sessionScreenshots) parts.push(`截图 ${this.sessionScreenshots}`);
    if (this.sessionReviews) parts.push(`复习 ${this.sessionReviews}`);
    if (this.currentState.pendingCaptures) parts.push(`待补传 ${this.currentState.pendingCaptures}`);
    this.sessionLine.textContent = parts.join(" · ");
  }

  openSessionSummary(): void {
    this.closeSessionSummary();
    const minutes = this.sessionMinutes();
    const lines = [
      "学习小结",
      `课程：${this.currentState.courseTitle || "—"}`,
      `章节：${this.currentState.chapterTitle || "—"}`,
      `本次：${minutes} 分钟`,
      `笔记：${this.sessionNotes} 条`,
      `疑问：${this.sessionQuestions} 条`,
      `截图：${this.sessionScreenshots} 张`,
      `复习卡：${this.sessionReviews} 张`,
    ];
    const modal = document.createElement("div");
    modal.id = "learning-assistant-session-summary";
    modal.style.cssText = "position:fixed;left:50%;top:22%;transform:translateX(-50%);width:360px;max-width:92vw;background:#101820;border:1px solid #31465c;border-radius:10px;box-shadow:0 16px 44px rgba(0,0,0,.45);z-index:2147483647;color:#f4f7fb";
    const header = document.createElement("div");
    header.textContent = "本次学习小结";
    header.style.cssText = "padding:10px 12px;border-bottom:1px solid #31465c;font-weight:600";
    modal.appendChild(header);
    const body = document.createElement("div");
    body.style.cssText = "padding:10px 12px;display:grid;gap:4px;font-size:12.5px;line-height:1.6;color:#f4f7fb";
    for (const line of lines.slice(1)) {
      const row = document.createElement("div");
      row.textContent = line;
      body.appendChild(row);
    }
    const status = document.createElement("div");
    status.style.cssText = "min-height:16px;color:#9fb3c8;font-size:11px";
    body.appendChild(status);
    this.summaryStatus = status;
    modal.appendChild(body);
    const footer = document.createElement("div");
    footer.style.cssText = "padding:0 12px 12px;display:flex;justify-content:flex-end;gap:8px";
    const copy = this.makeButton("复制小结", () => { void this.copySessionSummary(lines.join("\n")); }, "#31465c");
    footer.appendChild(copy);
    footer.appendChild(this.makeButton("关闭", () => this.closeSessionSummary(), "#31465c"));
    modal.appendChild(footer);
    this.root.appendChild(modal);
    this.summaryModal = modal;
    if (typeof document.addEventListener === "function") {
      document.addEventListener("keydown", this.summaryEscapeHandler, true);
    }
  }

  private async copySessionSummary(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      if (this.summaryStatus) this.summaryStatus.textContent = "已复制到剪贴板";
    } catch {
      if (this.summaryStatus) this.summaryStatus.textContent = "浏览器拒绝了剪贴板访问";
    }
  }

  private closeSessionSummary(): void {
    if (typeof document.removeEventListener === "function") {
      document.removeEventListener("keydown", this.summaryEscapeHandler, true);
    }
    if (this.summaryModal) this.root.removeChild(this.summaryModal);
    this.summaryModal = null;
    this.summaryStatus = null;
  }

  private readPosition(): OverlayPosition | null {
    try {
      const raw = globalThis.localStorage?.getItem(OVERLAY_POSITION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<OverlayPosition>;
      if (typeof parsed.left !== "number" || typeof parsed.top !== "number") return null;
      if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null;
      return { left: parsed.left, top: parsed.top };
    } catch {
      return null;
    }
  }

  /** 拖到视口外后能靠 Alt+H/刷新找回;这里把位置夹回可视区。 */
  private applyStoredPosition(): void {
    if (!this.position) return;
    const rect = typeof this.root.getBoundingClientRect === "function" ? this.root.getBoundingClientRect() : null;
    if (!rect || typeof window === "undefined") return;
    const next = clampOverlayPosition(
      this.position.left,
      this.position.top,
      rect.width || 280,
      rect.height || 200,
      window.innerWidth,
      window.innerHeight,
    );
    this.applyPosition(next);
  }

  private applyPosition(position: OverlayPosition): void {
    this.position = position;
    this.root.style.left = `${Math.round(position.left)}px`;
    this.root.style.top = `${Math.round(position.top)}px`;
    this.root.style.right = "auto";
    this.root.style.bottom = "auto";
  }

  private persistPosition(): void {
    if (!this.position) return;
    try {
      globalThis.localStorage?.setItem(OVERLAY_POSITION_KEY, JSON.stringify(this.position));
    } catch {
      // 页面禁用 localStorage 时只保留本次会话位置
    }
  }

  private enableRootDrag(handle: HTMLElement): void {
    handle.addEventListener("mousedown", (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("button")) return;
      if (typeof this.root.getBoundingClientRect !== "function") return;
      event.preventDefault();
      const rect = this.root.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const baseLeft = rect.left;
      const baseTop = rect.top;
      const onMove = (move: MouseEvent) => {
        if (typeof window === "undefined") return;
        this.applyPosition(clampOverlayPosition(
          baseLeft + move.clientX - startX,
          baseTop + move.clientY - startY,
          rect.width || 280,
          rect.height || 200,
          window.innerWidth,
          window.innerHeight,
        ));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        this.persistPosition();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  private readOpacity(): number {
    try {
      const raw = Number(globalThis.localStorage?.getItem(OVERLAY_OPACITY_KEY));
      return OVERLAY_OPACITY_STEPS.includes(raw as (typeof OVERLAY_OPACITY_STEPS)[number]) ? raw : 1;
    } catch {
      return 1;
    }
  }

  private applyOpacity(value: number): void {
    this.opacity = value;
    this.root.style.opacity = String(value);
    this.opacityButton.title = `透明度 ${Math.round(value * 100)}%（Alt+O 切换）`;
  }

  cycleOpacity(): void {
    this.applyOpacity(nextOverlayOpacity(this.opacity));
    try {
      globalThis.localStorage?.setItem(OVERLAY_OPACITY_KEY, String(this.opacity));
    } catch {
      // 忽略存储失败
    }
  }

  toggleCollapsed(): void {
    this.setCollapsed(!this.collapsed);
  }

  /** 隐私模式下隐藏截图入口；快捷键仍会走回调并提示原因。 */
  setScreenshotEnabled(enabled: boolean): void {
    this.screenshotButton.disabled = !enabled;
    this.screenshotButton.style.display = enabled ? "" : "none";
    this.screenshotButton.title = enabled ? "截取当前画面并存证（Alt+S）" : "隐私模式已开启，截图存证不可用";
  }

  /** 快捷键/划词气泡用:直接截当前画面,复用原有截图流程。 */
  triggerScreenshot(): void {
    void this.captureScreenshot();
  }

  /** 划词后把选中文本作为引用打开笔记弹窗。 */
  openNoteFromSelection(text: string): void {
    const sourceText = text.trim();
    if (!sourceText) return;
    this.openNoteEditor({ sourceText });
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
    this.applyBilingualLayout();
  }

  private applyBilingualLayout(): void {
    if (this.collapsed) return;
    this.root.style.width = this.bilingual ? "440px" : "280px";
  }

  /** 开关双语并立即翻译当前字幕。 */
  setBilingual(enabled: boolean): void {
    this.bilingual = enabled;
    this.applyBilingualLayout();
    if (!enabled) {
      if (this.translationTimer !== undefined && typeof window !== "undefined") {
        window.clearTimeout(this.translationTimer);
        this.translationTimer = undefined;
      }
      this.translationRequestId += 1;
      this.currentState.translation = undefined;
      this.lastTranslatedTranscript = "";
      this.render();
      return;
    }
    this.lastTranslatedTranscript = "";
    this.scheduleTranslation(true);
  }

  private scheduleTranslation(immediate = false): void {
    if (!this.bilingual) return;
    const transcript = this.currentState.transcript?.trim();
    if (!transcript) {
      this.currentState.translation = undefined;
      this.render();
      return;
    }
    if (!this.callbacks.onTranslate) {
      this.currentState.translation = "请先在控制台配置 LLM";
      this.render();
      return;
    }
    if (transcript === this.lastTranslatedTranscript) return;
    this.lastTranslatedTranscript = transcript;
    this.currentState.translation = "翻译中…";
    this.render();
    if (this.translationTimer !== undefined && typeof window !== "undefined") {
      window.clearTimeout(this.translationTimer);
      this.translationTimer = undefined;
    }
    const run = (): void => { void this.translateCurrent(transcript); };
    if (immediate || typeof window === "undefined") {
      run();
    } else {
      this.translationTimer = window.setTimeout(run, 450);
    }
  }

  private async translateCurrent(transcript: string): Promise<void> {
    if (!this.callbacks.onTranslate) return;
    const requestId = ++this.translationRequestId;
    try {
      const translation = await this.callbacks.onTranslate(transcript, translationTarget(transcript));
      if (requestId !== this.translationRequestId || this.currentState.transcript?.trim() !== transcript) return;
      this.currentState.translation = translation;
      this.render();
    } catch (error) {
      if (requestId !== this.translationRequestId || this.currentState.transcript?.trim() !== transcript) return;
      const message = error instanceof Error && error.message ? error.message : "请稍后重试";
      this.currentState.translation = `翻译失败：${message}`;
      this.render();
    }
  }

  private readCollapsedPreference(): boolean {
    try {
      return globalThis.localStorage?.getItem(COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  update(state: Partial<OverlayState>): void {
    const previousTranscript = this.currentState.transcript;
    this.currentState = { ...this.currentState, ...state };
    this.render();
    if (state.pendingCaptures !== undefined) this.renderSession();
    if (this.bilingual && state.transcript !== undefined && state.transcript !== previousTranscript) {
      this.scheduleTranslation();
    }
  }

  private render(): void {
    const state = this.currentState;
    const lines = [
      state.adapterName ? `适配器: ${state.adapterName}` : null,
      state.courseTitle ? `课程: ${state.courseTitle}` : null,
      state.chapterTitle ? `章节: ${state.chapterTitle}` : null,
      `状态: ${state.status || "待连接"}`,
    ].filter(Boolean);
    this.status.textContent = lines.join("\n");
    this.status.style.whiteSpace = "pre-line";

    const baseMeta = "margin-top:6px;font-size:12px;color:#9fb3c8;line-height:1.45;";
    const transcript = state.transcript?.trim();
    const time = state.timeSeconds !== undefined ? `${formatVideoTime(state.timeSeconds)}  ` : "";
    const showBilingual = this.bilingual && Boolean(transcript);
    this.bilingualButton.style.background = this.bilingual ? "#1f8fff" : "#31465c";
    if (showBilingual) {
      this.meta.style.cssText = `${baseMeta}display:none;`;
      this.bilingualBox.style.display = "grid";
      this.bilingualOriginal.textContent = `${time}${transcript}`;
      this.bilingualTranslation.textContent = state.translation ?? "翻译中…";
    } else {
      this.bilingualBox.style.display = "none";
      if (transcript) {
        this.meta.textContent = `${time}${transcript}`;
        this.meta.title = "点击记下这句";
        this.meta.style.cssText = `${baseMeta}display:block;padding:6px 8px;border-left:2px solid #1f8fff;background:#0b1220;border-radius:0 6px 6px 0;max-height:54px;overflow:auto;white-space:pre-wrap;cursor:pointer;`;
      } else if (state.timeSeconds !== undefined) {
        this.meta.textContent = `当前 ${formatVideoTime(state.timeSeconds)}`;
        this.meta.title = "";
        this.meta.style.cssText = `${baseMeta}display:block;cursor:default;`;
      } else {
        this.meta.style.cssText = `${baseMeta}display:none;`;
      }
    }

    const continueSeconds = state.continueSeconds;
    if (continueSeconds !== undefined && continueSeconds > 10) {
      this.continueButton.textContent = `继续上次 ${formatVideoTime(continueSeconds)}`;
      this.continueButton.style.display = "inline-block";
    } else {
      this.continueButton.style.display = "none";
    }
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
    const directCapture = this.callbacks.onCaptureScreenshot;
    const captureImage = this.callbacks.onCaptureScreenshotImage;
    const saveImage = this.callbacks.onSaveScreenshot;
    const canEdit = Boolean(captureImage && saveImage);
    if (!directCapture && !canEdit) {
      this.update({ status: "请先在扩展选项中完成插件绑定，再截图存证" });
      return;
    }
    if (this.capturingScreenshot) return;
    this.capturingScreenshot = true;
    this.screenshotButton.disabled = true;
    this.screenshotButton.textContent = "截图中…";
    // 截的是整个标签页画面,先隐藏浮层并等待重绘,避免浮层本身出现在存证截图里
    this.root.style.display = "none";
    this.mini.style.display = "none";
    await waitForRepaint();
    try {
      if (canEdit && captureImage && saveImage) {
        const raw = await captureImage();
        const remoteEdited = this.callbacks.onRequestScreenshotEditor
          ? await this.callbacks.onRequestScreenshotEditor(raw.imageBase64)
          : undefined;
        if (remoteEdited === null) {
          this.applyCollapsed(this.collapsed);
          this.update({ status: "已取消截图存证" });
          return;
        }
        if (typeof remoteEdited === "string") {
          const saved = await saveImage(remoteEdited, raw.videoTimeSeconds);
          const result = typeof saved === "number" ? { seconds: saved } : saved ?? {};
          this.sessionScreenshots += 1;
          this.renderSession();
          this.applyCollapsed(this.collapsed);
          this.update({
            status: result.queued
              ? "截图已离线保存，联网后自动补传"
              : result.seconds === undefined
                ? "截图已存证"
                : `已存证 ${formatVideoTime(result.seconds)}`,
          });
          return;
        }
        const editor = new ScreenshotEditor({
          imageDataUrl: raw.imageBase64,
          onCancel: () => {
            this.screenshotEditorOpen = false;
            this.applyCollapsed(this.collapsed);
            this.update({ status: "已取消截图存证" });
          },
          onSave: async (imageDataUrl) => {
            const saved = await saveImage(imageDataUrl, raw.videoTimeSeconds);
            const result = typeof saved === "number" ? { seconds: saved } : saved ?? {};
            this.sessionScreenshots += 1;
            this.renderSession();
            this.update({
              status: result.queued
                ? "截图已离线保存，联网后自动补传"
                : result.seconds === undefined
                  ? "截图已存证"
                  : `已存证 ${formatVideoTime(result.seconds)}`,
            });
            // 编辑器在 onSave 返回后自己移除，等一帧再把浮层放回来
            window.setTimeout(() => {
              this.screenshotEditorOpen = false;
              this.applyCollapsed(this.collapsed);
            }, 0);
          },
        });
        this.screenshotEditorOpen = true;
        editor.mount();
      } else if (directCapture) {
        const seconds = await directCapture();
        this.applyCollapsed(this.collapsed);
        this.update({ status: seconds === undefined ? "截图已存证" : `已存证 ${formatVideoTime(seconds)}` });
      }
    } catch (error) {
      this.applyCollapsed(this.collapsed);
      const message = error instanceof Error && error.message ? error.message : "请稍后重试";
      this.update({ status: `截图存证失败：${message}` });
    } finally {
      if (!this.screenshotEditorOpen) this.applyCollapsed(this.collapsed);
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
    this.openNoteEditor();
  }

  /** 供划词气泡/快捷键调用;可预填引用原文、标签和"加入复习"。 */
  openNoteEditor(options: NoteEditorOptions = {}): void {
    if (!this.callbacks.onSaveNote) {
      this.update({ status: "请先在扩展选项中完成插件绑定，再添加笔记" });
      return;
    }
    if (this.noteModal) this.closeNoteEditor();
    this.openNoteModal(options);
  }

  private openQuestionNote(): void {
    this.openNoteEditor({
      tags: ["疑问"],
      sourceText: this.currentState.transcript?.trim() || undefined,
    });
  }

  private openReviewNote(): void {
    this.openNoteEditor({
      content: this.currentState.transcript?.trim() || "",
      addToReview: true,
      tags: ["考点"],
    });
  }

  openAskFromTranscript(): void {
    const transcript = this.currentState.transcript?.trim() || "";
    this.openAskDialog(transcript ? `请解释这句话：${transcript}` : "", Boolean(transcript));
  }

  /** 浮层内 AI 问答;有字幕时默认带上"解释这句"并自动提问。 */
  openAskDialog(initialQuestion = "", autoAsk = false): void {
    if (!this.callbacks.onAsk) {
      this.update({ status: "请先在扩展选项中完成插件绑定，再使用 AI 问答" });
      return;
    }
    this.closeAskDialog();
    const modal = document.createElement("div");
    modal.id = "learning-assistant-ask-modal";
    modal.style.cssText = [
      "position:fixed",
      "left:50%",
      "top:18%",
      "transform:translateX(-50%)",
      "width:420px",
      "max-width:92vw",
      "background:#101820",
      "border:1px solid #31465c",
      "border-radius:10px",
      "box-shadow:0 16px 44px rgba(0,0,0,.45)",
      "z-index:2147483647",
      "color:#f4f7fb",
    ].join(";");

    const header = document.createElement("div");
    header.textContent = "AI 问答（按住此栏可拖动）";
    header.style.cssText = "cursor:move;user-select:none;padding:10px 12px;border-bottom:1px solid #31465c;font-weight:600";
    this.enableDrag(header, modal);
    modal.appendChild(header);

    const body = document.createElement("div");
    body.style.cssText = "padding:10px 12px;display:grid;gap:8px";
    const transcript = this.currentState.transcript?.trim();
    if (transcript) {
      const quote = document.createElement("div");
      quote.textContent = transcript;
      quote.style.cssText = "max-height:72px;overflow:auto;border-left:3px solid #1f8fff;background:#0b1220;padding:6px 8px;border-radius:0 6px 6px 0;color:#9fb3c8;font-size:12px;line-height:1.5;white-space:pre-wrap";
      body.appendChild(quote);
    }

    const input = document.createElement("textarea");
    input.rows = 3;
    input.value = initialQuestion;
    input.placeholder = "就当前章节提问，回答会带字幕出处…";
    input.style.cssText = "box-sizing:border-box;width:100%;padding:8px;border-radius:6px;border:1px solid #31465c;background:#0b1220;color:#f4f7fb;font:inherit;resize:vertical";
    input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void this.askQuestion();
      }
    });
    body.appendChild(input);

    const status = document.createElement("div");
    status.style.cssText = "min-height:16px;color:#9fb3c8;font-size:12px";
    body.appendChild(status);

    const answer = document.createElement("div");
    answer.style.cssText = "display:none;max-height:220px;overflow:auto;border-top:1px solid #31465c;padding-top:8px;color:#f4f7fb;font-size:13px;line-height:1.6;white-space:pre-wrap";
    body.appendChild(answer);

    const citations = document.createElement("div");
    citations.style.cssText = "display:none;color:#9fb3c8;font-size:11px;line-height:1.5;border-left:2px solid #31465c;padding-left:8px;max-height:100px;overflow:auto";
    body.appendChild(citations);
    this.askAnswer = answer;
    this.askCitations = citations;
    this.askStatus = status;
    this.askInput = input;

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center";
    this.askButton = this.makeButton("提问", () => { void this.askQuestion(); });
    this.askNoteButton = this.makeButton("存为笔记", () => this.saveAskAsNote(), "#31465c");
    this.askNoteButton.style.display = "none";
    const closeButton = this.makeButton("关闭", () => this.closeAskDialog(), "#31465c");
    actions.appendChild(this.askButton);
    const translateButton = this.makeButton("翻译这句", () => {
      const transcript = this.currentState.transcript?.trim();
      if (!transcript || !this.askInput) {
        if (this.askStatus) this.askStatus.textContent = "当前没有可翻译的字幕";
        return;
      }
      this.askInput.value = translationPrompt(transcript);
      void this.askQuestion();
    }, "#31465c");
    translateButton.title = "把当前字幕翻译成中文/英文";
    actions.appendChild(translateButton);
    actions.appendChild(this.askNoteButton);
    actions.appendChild(closeButton);
    body.appendChild(actions);
    modal.appendChild(body);

    this.root.appendChild(modal);
    this.askModal = modal;
    if (typeof document.addEventListener === "function") {
      document.addEventListener("keydown", this.askEscapeHandler, true);
    }
    input.focus?.();
    input.setSelectionRange?.(input.value.length, input.value.length);
    if (autoAsk) void this.askQuestion();
  }

  private closeAskDialog(): void {
    if (typeof document.removeEventListener === "function") {
      document.removeEventListener("keydown", this.askEscapeHandler, true);
    }
    if (this.askModal) this.root.removeChild(this.askModal);
    this.askModal = null;
    this.askInput = null;
    this.askAnswer = null;
    this.askCitations = null;
    this.askStatus = null;
    this.askButton = null;
    this.askNoteButton = null;
    this.asking = false;
  }

  private async askQuestion(): Promise<void> {
    if (this.asking || !this.askInput || !this.askStatus || !this.callbacks.onAsk) return;
    const question = this.askInput.value.trim();
    if (!question) {
      this.askStatus.textContent = "请输入问题";
      return;
    }
    this.asking = true;
    const askButton = this.askButton;
    if (askButton) {
      askButton.disabled = true;
      askButton.textContent = "思考中…";
    }
    this.askStatus.textContent = "正在检索字幕并生成回答…";
    if (this.askAnswer) {
      this.askAnswer.textContent = "";
      this.askAnswer.style.display = "none";
    }
    if (this.askCitations) {
      this.askCitations.textContent = "";
      this.askCitations.style.display = "none";
    }
    if (this.askNoteButton) this.askNoteButton.style.display = "none";
    try {
      const result = await this.callbacks.onAsk(question);
      if (this.askAnswer) {
        this.askAnswer.textContent = result.answer;
        this.askAnswer.style.display = "block";
      }
      if (this.askCitations) {
        this.askCitations.replaceChildren();
        for (const citation of result.citations) {
          const line = document.createElement("div");
          const time = citation.start_seconds !== null && citation.start_seconds !== undefined
            ? `[${formatVideoTime(citation.start_seconds)}] `
            : "";
          line.textContent = `${time}${citation.chapter_title} · ${citation.excerpt}`;
          this.askCitations.appendChild(line);
        }
        this.askCitations.style.display = result.citations.length ? "block" : "none";
      }
      this.askStatus.textContent = "";
      if (this.askNoteButton) this.askNoteButton.style.display = "inline-block";
    } catch (error) {
      this.askStatus.textContent = `问答失败：${error instanceof Error && error.message ? error.message : "请稍后重试"}`;
    } finally {
      this.asking = false;
      if (askButton) {
        askButton.disabled = false;
        askButton.textContent = "提问";
      }
    }
  }

  private saveAskAsNote(): void {
    const answer = this.askAnswer?.textContent?.trim();
    if (!answer) return;
    const citations = this.askCitations?.textContent?.trim();
    const content = citations ? `${answer}\n\n---\n${citations}` : answer;
    const sourceText = this.currentState.transcript?.trim() || undefined;
    this.closeAskDialog();
    this.openNoteEditor({ content, sourceText });
  }

  private toggleVoiceInput(): void {
    if (this.voiceRecognition) {
      this.voiceRecognition.stop();
      this.voiceRecognition = null;
      if (this.voiceButton) this.voiceButton.textContent = "语音输入";
      this.update({ status: "语音输入已停止" });
      return;
    }
    const scope = globalThis as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        start: () => void;
        stop: () => void;
        onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: ((event: { error?: string }) => void) | null;
        onend: (() => void) | null;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        start: () => void;
        stop: () => void;
        onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: ((event: { error?: string }) => void) | null;
        onend: (() => void) | null;
      };
    };
    const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
    if (!Recognition) {
      this.update({ status: "当前浏览器不支持语音识别" });
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      if (!this.noteInput) return;
      let added = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        added += event.results[index][0]?.transcript ?? "";
      }
      if (added.trim()) {
        this.noteInput.value = this.noteInput.value ? `${this.noteInput.value}${added}` : added.trim();
        this.scheduleDraftSave();
      }
    };
    recognition.onerror = (event) => {
      this.update({ status: `语音输入失败：${event.error || "请检查麦克风权限"}` });
    };
    recognition.onend = () => {
      this.voiceRecognition = null;
      if (this.voiceButton) this.voiceButton.textContent = "语音输入";
    };
    try {
      recognition.start();
    } catch (error) {
      this.update({ status: `语音输入启动失败：${error instanceof Error ? error.message : "请检查麦克风权限"}` });
      return;
    }
    this.voiceRecognition = recognition;
    if (this.voiceButton) this.voiceButton.textContent = "停止语音";
    this.update({ status: "正在听…" });
  }

  private openNoteModal(options: NoteEditorOptions = {}): void {
    this.noteContext = { sourceText: options.sourceText, addToReview: options.addToReview };
    this.noteAddToReview = Boolean(options.addToReview);
    this.noteTags = [...(options.tags ?? [])];
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
    header.textContent = options.addToReview
      ? "加入复习（按住此栏可拖动）"
      : this.noteTags.includes("疑问")
        ? "标记疑问（按住此栏可拖动）"
        : "添加笔记（按住此栏可拖动）";
    header.style.cssText = "cursor:move;user-select:none;padding:10px 12px;border-bottom:1px solid #31465c;font-weight:600";
    this.enableDrag(header, modal);
    modal.appendChild(header);

    const body = document.createElement("div");
    body.style.cssText = "padding:10px 12px";

    if (options.sourceText) {
      const quote = document.createElement("div");
      quote.textContent = options.sourceText;
      quote.style.cssText = "margin-bottom:8px;max-height:96px;overflow:auto;border-left:3px solid #1f8fff;background:#0b1220;padding:6px 8px;border-radius:0 6px 6px 0;color:#9fb3c8;font-size:12px;line-height:1.5;white-space:pre-wrap";
      body.appendChild(quote);
      this.noteQuote = quote;
    }

    const input = document.createElement("textarea");
    input.rows = 6;
    input.value = options.content ?? "";
    input.placeholder = this.noteTags.includes("疑问")
      ? "写下你的疑问，保存后可在控制台「疑问」标签里找到…"
      : options.addToReview
        ? "写下要复习的内容，保存后会生成一张到期复习卡…"
        : "记录当前视频时间点的笔记，可直接粘贴图片…";
    input.style.cssText = "box-sizing:border-box;width:100%;padding:8px;border-radius:6px;border:1px solid #31465c;background:#0b1220;color:#f4f7fb;font:inherit;resize:vertical";
    input.addEventListener("paste", (event: ClipboardEvent) => this.handleNotePaste(event));
    input.addEventListener("input", () => this.scheduleDraftSave());
    body.appendChild(input);

    const templateRow = document.createElement("div");
    templateRow.style.cssText = "margin-top:6px;display:flex;align-items:center;gap:6px;color:#9fb3c8;font-size:12px";
    const templateLabel = document.createElement("span");
    templateLabel.textContent = "模板";
    const templateSelect = document.createElement("select");
    templateSelect.style.cssText = "padding:4px 6px;border-radius:6px;border:1px solid #31465c;background:#0b1220;color:#f4f7fb;font:inherit;font-size:12px;cursor:pointer";
    const blankOption = document.createElement("option");
    blankOption.value = "";
    blankOption.textContent = "选择模板…";
    templateSelect.appendChild(blankOption);
    for (const template of NOTE_TEMPLATES) {
      const option = document.createElement("option");
      option.value = template.value;
      option.textContent = template.label;
      templateSelect.appendChild(option);
    }
    templateSelect.addEventListener("change", () => {
      const template = NOTE_TEMPLATES.find((item) => item.value === templateSelect.value);
      if (template) this.applyNoteTemplate(template.text);
      templateSelect.value = "";
    });
    templateRow.appendChild(templateLabel);
    templateRow.appendChild(templateSelect);
    body.appendChild(templateRow);

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
    this.voiceButton = this.makeButton("语音输入", () => this.toggleVoiceInput(), "#31465c");
    this.voiceButton.title = "用浏览器语音识别把说的话转成笔记";
    toolbar.appendChild(this.voiceButton);
    body.appendChild(toolbar);

    if (!options.content && !options.sourceText) {
      const draft = this.readDraft();
      if (draft) input.value = draft;
    }

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

    const reviewRow = document.createElement("label");
    reviewRow.style.cssText = "margin-top:8px;display:flex;align-items:center;gap:6px;color:#9fb3c8;font-size:12px;cursor:pointer";
    const reviewCheckbox = document.createElement("input");
    reviewCheckbox.type = "checkbox";
    reviewCheckbox.checked = this.noteAddToReview;
    reviewCheckbox.style.cssText = "accent-color:#1f8fff;cursor:pointer";
    reviewCheckbox.addEventListener("change", () => {
      this.noteAddToReview = reviewCheckbox.checked;
    });
    reviewRow.appendChild(reviewCheckbox);
    const reviewLabel = document.createElement("span");
    reviewLabel.textContent = "保存后加入复习";
    reviewRow.appendChild(reviewLabel);
    this.noteReviewCheckbox = reviewCheckbox;
    body.appendChild(reviewRow);
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
    if (typeof document.addEventListener === "function") {
      document.addEventListener("keydown", this.noteEscapeHandler, true);
    }
    input.focus?.();
    input.setSelectionRange?.(input.value.length, input.value.length);
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

  private draftStorageKey(): string | null {
    const key = this.currentState.draftKey;
    return key ? `learning-assistant:note-draft:${key}` : null;
  }

  private readDraft(): string {
    const key = this.draftStorageKey();
    if (!key) return "";
    try {
      return globalThis.localStorage?.getItem(key)?.trim() ?? "";
    } catch {
      return "";
    }
  }

  private scheduleDraftSave(): void {
    if (typeof window === "undefined") return;
    if (this.draftTimer !== undefined) window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = undefined;
      this.saveDraftNow();
    }, 300);
  }

  private saveDraftNow(): void {
    const key = this.draftStorageKey();
    if (!key || !this.noteInput) return;
    try {
      const value = this.noteInput.value;
      if (value.trim()) globalThis.localStorage?.setItem(key, value);
      else globalThis.localStorage?.removeItem(key);
    } catch {
      // 隐私模式等场景写不进去时忽略
    }
  }

  private clearDraft(): void {
    const key = this.draftStorageKey();
    if (key) {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // 忽略
      }
    }
  }

  private applyNoteTemplate(text: string): void {
    if (!this.noteInput) return;
    const current = this.noteInput.value.trimEnd();
    this.noteInput.value = current ? `${current}\n\n${text}` : text;
    const end = this.noteInput.value.length;
    this.noteInput.setSelectionRange?.(end, end);
    this.noteInput.focus?.();
    this.scheduleDraftSave();
  }

  private closeNoteEditor(): void {
    if (typeof document.removeEventListener === "function") {
      document.removeEventListener("keydown", this.noteEscapeHandler, true);
    }
    if (this.draftTimer !== undefined && typeof window !== "undefined") {
      window.clearTimeout(this.draftTimer);
      this.draftTimer = undefined;
    }
    this.saveDraftNow();
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
    this.noteContext = {};
    this.noteAddToReview = false;
    this.noteQuote = null;
    this.noteReviewCheckbox = null;
    this.voiceButton = null;
    this.voiceRecognition?.stop();
    this.voiceRecognition = null;
  }

  private async saveNote(): Promise<void> {
    if (!this.callbacks.onSaveNote || this.savingNote || !this.noteInput) return;
    const content = this.noteInput.value.trim();
    if (!content) {
      this.update({ status: "笔记内容不能为空" });
      return;
    }
    const saveTags = [...this.noteTags];
    const saveButton = this.noteSaveButton;
    const cancelButton = this.noteCancelButton;
    this.savingNote = true;
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "保存中…";
    }
    if (cancelButton) cancelButton.disabled = true;
    try {
      const options: NoteSaveOptions = {};
      if (this.noteContext.sourceText) options.sourceText = this.noteContext.sourceText;
      if (this.noteAddToReview) options.addToReview = true;
      const result = Object.keys(options).length
        ? await this.callbacks.onSaveNote(content, saveTags, options)
        : await this.callbacks.onSaveNote(content, saveTags);
      const normalized: NoteSaveResult = typeof result === "number" ? { seconds: result } : result ?? {};
      this.sessionNotes += 1;
      if (saveTags.includes("疑问")) this.sessionQuestions += 1;
      if (normalized.reviewCreated) this.sessionReviews += 1;
      this.renderSession();
      let status = normalized.seconds === undefined ? "笔记已保存" : `已保存 ${formatVideoTime(normalized.seconds)}`;
      if (normalized.queued) status = "已离线保存，联网后自动补传";
      if (normalized.reviewCreated) status += " · 已加入复习";
      if (normalized.reviewError) status += ` · 复习卡失败：${normalized.reviewError}`;
      this.update({ status });
      if (this.noteInput) this.noteInput.value = "";
      this.clearDraft();
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
    button.style.cssText = `margin:8px 6px 0 0;padding:6px 8px;border-radius:6px;border:0;background:${background};color:#ffffff;font-size:13px;font-weight:500;line-height:1.4;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer`;
    assertAssistantOnlyElement(button);
    button.addEventListener("click", onClick);
    return button;
  }
}

export interface ScreenshotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotPoint {
  x: number;
  y: number;
}

/** 两个拖拽点 → 左上角为正的矩形(反向拖也能得到正确区域)。 */
export function rectFromPoints(start: ScreenshotPoint, end: ScreenshotPoint): ScreenshotRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/** 裁剪区域与打码区域的交集;没有交集时返回 null。 */
export function intersectRect(a: ScreenshotRect, b: ScreenshotRect): ScreenshotRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

export function isUsableRect(rect: ScreenshotRect, minSize = 6): boolean {
  return rect.width >= minSize && rect.height >= minSize;
}

interface EditorOptions {
  imageDataUrl: string;
  /** 存证完成(或失败)后关闭编辑器;失败时返回错误文案由编辑器展示。 */
  onSave: (imageDataUrl: string) => Promise<void>;
  onCancel: () => void;
}

type Tool = "crop" | "redact" | "text";

interface TextAnnotation {
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

/**
 * 截图存证编辑器:拖拽框选裁剪,马赛克打码,存证前不离开页面。
 * 纯 DOM/Canvas 实现,不依赖控制台的截图编辑器。
 */
export class ScreenshotEditor {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly status: HTMLDivElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly toolButtons: Record<Tool, HTMLButtonElement>;
  private readonly textInput: HTMLInputElement;
  private image: HTMLImageElement | null = null;
  private crop: ScreenshotRect = { x: 0, y: 0, width: 0, height: 0 };
  private redactions: ScreenshotRect[] = [];
  private texts: TextAnnotation[] = [];
  private history: { crop: ScreenshotRect; redactions: ScreenshotRect[]; texts: TextAnnotation[] }[] = [];
  private tool: Tool = "crop";
  private dragStart: ScreenshotPoint | null = null;
  private dragging = false;
  private saving = false;
  private readonly onEscape = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      this.close();
    }
  };

  constructor(private readonly options: EditorOptions) {
    this.root = document.createElement("div");
    this.root.id = "learning-assistant-screenshot-editor";
    this.root.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "background:rgba(8,13,23,.72)",
      "padding:16px",
      "font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    ].join(";");

    const panel = document.createElement("div");
    panel.style.cssText = "display:flex;flex-direction:column;gap:10px;max-width:94vw;max-height:92vh;background:#101820;border:1px solid #31465c;border-radius:12px;padding:12px;box-shadow:0 24px 60px rgba(0,0,0,.5);color:#f4f7fb";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "截图存证编辑");

    const header = document.createElement("div");
    header.textContent = "截图存证 · 拖拽裁剪、马赛克打码，或添加文字标注";
    header.style.cssText = "font-weight:600;font-size:13px;color:#f4f7fb";
    panel.appendChild(header);

    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center";
    const cropButton = this.makeButton("裁剪", () => this.setTool("crop"));
    const redactButton = this.makeButton("马赛克", () => this.setTool("redact"));
    const textButton = this.makeButton("文字", () => this.setTool("text"));
    this.toolButtons = { crop: cropButton, redact: redactButton, text: textButton };
    toolbar.appendChild(cropButton);
    toolbar.appendChild(redactButton);
    toolbar.appendChild(textButton);
    this.textInput = document.createElement("input");
    this.textInput.type = "text";
    this.textInput.placeholder = "输入标注文字，再点画面放置";
    this.textInput.style.cssText = "flex:1;min-width:150px;padding:5px 8px;border:1px solid #31465c;border-radius:6px;background:#0b1220;color:#f4f7fb;font:12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
    this.textInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.setTool("text");
      }
    });
    toolbar.appendChild(this.textInput);
    this.undoButton = this.makeButton("撤销", () => this.undo(), "#31465c");
    toolbar.appendChild(this.undoButton);
    const resetButton = this.makeButton("重置", () => this.reset(), "#31465c");
    toolbar.appendChild(resetButton);
    panel.appendChild(toolbar);

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;max-width:88vw;max-height:64vh;border-radius:8px;background:#0b1220;cursor:crosshair;touch-action:none";
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持 Canvas，无法编辑截图");
    this.ctx = context;
    panel.appendChild(this.canvas);

    this.status = document.createElement("div");
    this.status.style.cssText = "min-height:18px;color:#f87171;font-size:12px";
    panel.appendChild(this.status);

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px";
    const cancelButton = this.makeButton("取消", () => this.close(), "#31465c");
    this.saveButton = this.makeButton("存证", () => { void this.save(); });
    footer.appendChild(cancelButton);
    footer.appendChild(this.saveButton);
    panel.appendChild(footer);
    this.root.appendChild(panel);

    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event));
    this.canvas.addEventListener("pointercancel", () => this.onPointerUp(null));
    document.addEventListener("keydown", this.onEscape, true);
    this.updateToolButtons();
    this.loadImage();
  }

  mount(): void {
    document.documentElement.appendChild(this.root);
    this.canvas.focus?.();
  }

  close(): void {
    if (this.saving) return;
    document.removeEventListener("keydown", this.onEscape, true);
    this.root.remove();
    this.options.onCancel();
  }

  private makeButton(label: string, onClick: () => void, background = "#1f8fff"): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `padding:6px 10px;border:0;border-radius:6px;background:${background};color:#fff;font:500 12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer`;
    button.addEventListener("click", onClick);
    return button;
  }

  private loadImage(): void {
    const image = new Image();
    image.onload = () => {
      this.image = image;
      this.canvas.width = image.naturalWidth;
      this.canvas.height = image.naturalHeight;
      const maxWidth = Math.min(window.innerWidth * 0.88, 1100);
      const maxHeight = window.innerHeight * 0.62;
      const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
      this.canvas.style.width = `${Math.round(image.naturalWidth * scale)}px`;
      this.canvas.style.height = `${Math.round(image.naturalHeight * scale)}px`;
      this.crop = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
      this.draw();
    };
    image.onerror = () => {
      this.status.textContent = "截图加载失败，请重试";
      this.saveButton.disabled = true;
    };
    image.src = this.options.imageDataUrl;
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    if (tool === "text") this.textInput.focus?.();
    this.updateToolButtons();
  }

  private updateToolButtons(): void {
    for (const [tool, button] of Object.entries(this.toolButtons) as [Tool, HTMLButtonElement][]) {
      button.style.background = tool === this.tool ? "#1f8fff" : "#31465c";
    }
    this.undoButton.disabled = this.history.length === 0;
    this.undoButton.style.opacity = this.history.length === 0 ? "0.5" : "1";
  }

  private pointFromEvent(event: PointerEvent): ScreenshotPoint {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / Math.max(rect.width, 1);
    const scaleY = this.canvas.height / Math.max(rect.height, 1);
    return {
      x: Math.max(0, Math.min(this.canvas.width, (event.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(this.canvas.height, (event.clientY - rect.top) * scaleY)),
    };
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.saving) return;
    if (this.tool === "text") {
      const value = this.textInput.value.trim();
      if (!value) {
        this.status.textContent = "先在输入框里写标注文字";
        this.textInput.focus?.();
        return;
      }
      const point = this.pointFromEvent(event);
      this.history.push(this.snapshot());
      this.texts.push({
        x: point.x,
        y: point.y,
        text: value,
        fontSize: Math.max(18, Math.round(this.canvas.width / 45)),
      });
      this.updateToolButtons();
      this.draw();
      return;
    }
    this.dragging = true;
    this.dragStart = this.pointFromEvent(event);
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragging || !this.dragStart) return;
    const preview = rectFromPoints(this.dragStart, this.pointFromEvent(event));
    this.draw(preview);
  }

  private onPointerUp(event: PointerEvent | null): void {
    if (!this.dragging || !this.dragStart) return;
    this.dragging = false;
    const end = event ? this.pointFromEvent(event) : this.dragStart;
    const rect = rectFromPoints(this.dragStart, end);
    this.dragStart = null;
    if (!isUsableRect(rect)) {
      this.draw();
      return;
    }
    this.history.push(this.snapshot());
    if (this.tool === "crop") this.crop = rect;
    else this.redactions = [...this.redactions, rect];
    this.updateToolButtons();
    this.draw();
  }

  private snapshot(): { crop: ScreenshotRect; redactions: ScreenshotRect[]; texts: TextAnnotation[] } {
    return {
      crop: { ...this.crop },
      redactions: [...this.redactions],
      texts: this.texts.map((item) => ({ ...item })),
    };
  }

  private undo(): void {
    const previous = this.history.pop();
    if (!previous) return;
    this.crop = previous.crop;
    this.redactions = previous.redactions;
    this.texts = previous.texts;
    this.updateToolButtons();
    this.draw();
  }

  private reset(): void {
    if (!this.image) return;
    this.history.push(this.snapshot());
    this.crop = { x: 0, y: 0, width: this.image.naturalWidth, height: this.image.naturalHeight };
    this.redactions = [];
    this.texts = [];
    this.updateToolButtons();
    this.draw();
  }

  private draw(preview?: ScreenshotRect): void {
    const image = this.image;
    if (!image) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(image, 0, 0);
    // 裁掉的部分压暗
    ctx.save();
    ctx.fillStyle = "rgba(8,13,23,.55)";
    const { x, y, width, height } = this.crop;
    ctx.fillRect(0, 0, this.canvas.width, y);
    ctx.fillRect(0, y + height, this.canvas.width, this.canvas.height - y - height);
    ctx.fillRect(0, y, x, height);
    ctx.fillRect(x + width, y, this.canvas.width - x - width, height);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "#1f8fff";
    ctx.lineWidth = Math.max(2, this.canvas.width / 800);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
    for (const redaction of this.redactions) this.pixelate(redaction);
    for (const annotation of this.texts) this.drawTextAnnotation(ctx, annotation, 0, 0);
    if (preview && isUsableRect(preview, 4)) {
      ctx.save();
      ctx.strokeStyle = this.tool === "crop" ? "#ffffff" : "#f87171";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = Math.max(1, this.canvas.width / 900);
      ctx.strokeRect(preview.x, preview.y, preview.width, preview.height);
      if (this.tool === "redact") {
        ctx.fillStyle = "rgba(248,113,113,.25)";
        ctx.fillRect(preview.x, preview.y, preview.width, preview.height);
      }
      ctx.restore();
    }
  }

  private drawTextAnnotation(
    context: CanvasRenderingContext2D,
    annotation: TextAnnotation,
    offsetX: number,
    offsetY: number,
  ): void {
    const width = context.canvas.width;
    const height = context.canvas.height;
    const fontSize = annotation.fontSize || Math.max(18, Math.round(width / 45));
    context.save();
    context.font = `600 ${fontSize}px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif`;
    const maxTextWidth = Math.max(80, width * 0.72);
    const lines: string[] = [];
    let line = "";
    for (const char of annotation.text) {
      const candidate = `${line}${char}`;
      if (line && context.measureText(candidate).width > maxTextWidth) {
        lines.push(line);
        line = char;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    const padding = Math.max(4, Math.round(fontSize * 0.28));
    const lineHeight = Math.round(fontSize * 1.25);
    const textWidth = Math.max(...lines.map((item) => context.measureText(item).width), 0);
    const boxWidth = Math.min(width, textWidth + padding * 2);
    const boxHeight = lines.length * lineHeight + padding * 2;
    const x = Math.min(Math.max(annotation.x - offsetX, 0), Math.max(0, width - boxWidth));
    const y = Math.min(Math.max(annotation.y - offsetY, 0), Math.max(0, height - boxHeight));
    context.fillStyle = "rgba(8,13,23,.78)";
    context.fillRect(x, y, boxWidth, boxHeight);
    context.strokeStyle = "#1f8fff";
    context.lineWidth = Math.max(1, Math.round(fontSize / 12));
    context.strokeRect(x, y, boxWidth, boxHeight);
    context.fillStyle = "#ffffff";
    context.textBaseline = "top";
    lines.forEach((item, index) => {
      context.fillText(item, x + padding, y + padding + index * lineHeight);
    });
    context.restore();
  }

  private pixelate(rect: ScreenshotRect): void {
    const image = this.image;
    if (!image) return;
    const target = intersectRect(rect, { x: 0, y: 0, width: this.canvas.width, height: this.canvas.height });
    if (!target) return;
    const block = 12;
    const tiny = document.createElement("canvas");
    tiny.width = Math.max(1, Math.round(target.width / block));
    tiny.height = Math.max(1, Math.round(target.height / block));
    const tinyCtx = tiny.getContext("2d");
    if (!tinyCtx) return;
    tinyCtx.imageSmoothingEnabled = false;
    tinyCtx.drawImage(image, target.x, target.y, target.width, target.height, 0, 0, tiny.width, tiny.height);
    this.ctx.save();
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, target.x, target.y, target.width, target.height);
    this.ctx.restore();
  }

  private async save(): Promise<void> {
    if (this.saving || !this.image) return;
    const crop = this.crop;
    if (crop.width < 6 || crop.height < 6) {
      this.status.textContent = "裁剪区域太小了";
      return;
    }
    this.saving = true;
    this.saveButton.disabled = true;
    this.saveButton.textContent = "存证中…";
    this.status.textContent = "";
    try {
      const output = document.createElement("canvas");
      output.width = Math.max(1, Math.round(crop.width));
      output.height = Math.max(1, Math.round(crop.height));
      const outputCtx = output.getContext("2d");
      if (!outputCtx) throw new Error("浏览器不支持 Canvas");
      outputCtx.drawImage(this.image, crop.x, crop.y, crop.width, crop.height, 0, 0, output.width, output.height);
      for (const redaction of this.redactions) {
        const clipped = intersectRect(redaction, crop);
        if (!clipped) continue;
        const block = 12;
        const tiny = document.createElement("canvas");
        tiny.width = Math.max(1, Math.round(clipped.width / block));
        tiny.height = Math.max(1, Math.round(clipped.height / block));
        const tinyCtx = tiny.getContext("2d");
        if (!tinyCtx) continue;
        tinyCtx.imageSmoothingEnabled = false;
        tinyCtx.drawImage(
          this.image,
          clipped.x,
          clipped.y,
          clipped.width,
          clipped.height,
          0,
          0,
          tiny.width,
          tiny.height,
        );
        outputCtx.save();
        outputCtx.imageSmoothingEnabled = false;
        outputCtx.drawImage(
          tiny,
          0,
          0,
          tiny.width,
          tiny.height,
          clipped.x - crop.x,
          clipped.y - crop.y,
          clipped.width,
          clipped.height,
        );
        outputCtx.restore();
      }
      outputCtx.save();
      outputCtx.beginPath();
      outputCtx.rect(0, 0, output.width, output.height);
      outputCtx.clip();
      for (const annotation of this.texts) {
        if (annotation.x < crop.x || annotation.y < crop.y) continue;
        this.drawTextAnnotation(outputCtx, annotation, crop.x, crop.y);
      }
      outputCtx.restore();
      await this.options.onSave(output.toDataURL("image/jpeg", 0.85));
      document.removeEventListener("keydown", this.onEscape, true);
      this.root.remove();
    } catch (error) {
      this.status.textContent = error instanceof Error && error.message ? error.message : "截图存证失败";
      this.saveButton.disabled = false;
      this.saveButton.textContent = "存证";
      this.saving = false;
    }
  }
}

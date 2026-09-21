import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { editorFontSize, mosaicFactor, normalizeRect, type Rect } from "./screenshotEditorUtils";

interface ScreenshotEditorProps {
  imageUrl: string;
  onSave: (dataUrl: string) => Promise<void>;
  onClose: () => void;
}

type EditorTool = "crop" | "text" | "blur";

const TOOL_LABELS: Array<{ id: EditorTool; label: string; hint: string }> = [
  { id: "crop", label: "裁剪", hint: "拖出要保留的区域,松开即裁剪" },
  { id: "text", label: "文字", hint: "点击图片放置批注,输入后点别处自动生效" },
  { id: "blur", label: "模糊", hint: "按住鼠标在要打码的区域拖动,实时模糊" },
];

export function ScreenshotEditor({ imageUrl, onSave, onClose }: ScreenshotEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const undoStack = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<EditorTool | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [brushing, setBrushing] = useState(false);
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [textSize, setTextSize] = useState(0);
  const [textColor, setTextColor] = useState("#e02323");
  const [blurRadius, setBlurRadius] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      setTextSize(editorFontSize(image.naturalWidth));
      setBlurRadius(Math.max(24, Math.round(image.naturalWidth / 40)));
      setReady(true);
    };
    image.onerror = () => setError("图片加载失败");
    image.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  function pushUndo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    undoStack.current.push(canvas.toDataURL("image/png"));
    if (undoStack.current.length > 12) undoStack.current.shift();
  }

  function undo() {
    const last = undoStack.current.pop();
    const canvas = canvasRef.current;
    if (!last || !canvas) return;
    const image = new Image();
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
    };
    image.src = last;
  }

  function canvasPoint(event: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  }

  function handleMouseDown(event: ReactMouseEvent<HTMLCanvasElement>) {
    if (!tool) return;
    const point = canvasPoint(event);
    if (tool === "text") {
      setTextPos(point);
      setTextValue("");
      return;
    }
    if (tool === "blur") {
      pushUndo();
      setBrushing(true);
      applyBlurAt(point);
      return;
    }
    setDragStart(point);
    setDragRect(null);
  }

  function handleMouseMove(event: ReactMouseEvent<HTMLCanvasElement>) {
    if (tool === "blur" && brushing) {
      applyBlurAt(canvasPoint(event));
      return;
    }
    if (!dragStart || tool !== "crop") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = canvasPoint(event);
    setDragRect(normalizeRect(dragStart.x, dragStart.y, point.x, point.y, canvas.width, canvas.height));
  }

  function handleMouseUp() {
    if (tool === "blur") {
      setBrushing(false);
      return;
    }
    if (!dragStart) return;
    const rect = dragRect;
    setDragStart(null);
    setDragRect(null);
    if (rect && tool === "crop") applyCrop(rect);
  }

  function applyCrop(rect: Rect) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    pushUndo();
    const data = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    canvas.width = rect.w;
    canvas.height = rect.h;
    ctx.putImageData(data, 0, 0);
  }

  function applyBlurAt(point: { x: number; y: number }) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const radius = blurRadius || 24;
    const rect = normalizeRect(point.x - radius, point.y - radius, point.x + radius, point.y + radius, canvas.width, canvas.height);
    if (!rect) return;
    const factor = mosaicFactor(rect);
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.round(rect.w / factor));
    off.height = Math.max(1, Math.round(rect.h / factor));
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, off.width, off.height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, off.width, off.height, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
  }

  function confirmText() {
    if (!textPos) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const value = textValue.trim();
    if (canvas && ctx && value) {
      pushUndo();
      const size = textSize || editorFontSize(canvas.width);
      ctx.font = `bold ${size}px -apple-system, "PingFang SC", sans-serif`;
      ctx.lineWidth = Math.max(3, size / 8);
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.strokeText(value, textPos.x, textPos.y);
      ctx.fillStyle = textColor;
      ctx.fillText(value, textPos.x, textPos.y);
    }
    setTextPos(null);
    setTextValue("");
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setError("");
    try {
      await onSave(canvas.toDataURL("image/jpeg", 0.9));
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setSaving(false);
    }
  }

  const canvas = canvasRef.current;
  const toPercent = (rect: Rect) => canvas
    ? {
        left: `${(rect.x / canvas.width) * 100}%`,
        top: `${(rect.y / canvas.height) * 100}%`,
        width: `${(rect.w / canvas.width) * 100}%`,
        height: `${(rect.h / canvas.height) * 100}%`,
      }
    : undefined;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(8,12,20,.88)", display: "flex", flexDirection: "column", alignItems: "center", padding: 16, overflow: "auto" }}
      onClick={(event) => event.stopPropagation()}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "center", marginBottom: 10 }}>
        {TOOL_LABELS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="text-button text-button-sm"
            style={tool === item.id ? { background: "#1f8fff", color: "#fff" } : undefined}
            onClick={() => setTool((current) => (current === item.id ? null : item.id))}
          >
            {item.label}
          </button>
        ))}
        {tool === "text" ? (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "#9fb3c8", fontSize: 12 }}>
            字号
            <input
              type="number"
              min={12}
              max={200}
              value={textSize || ""}
              onChange={(event) => setTextSize(Number(event.target.value) || 0)}
              style={{ width: 64 }}
            />
            颜色
            <input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} />
          </span>
        ) : null}
        {tool === "blur" ? (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "#9fb3c8", fontSize: 12 }}>
            半径
            <input
              type="range"
              min={12}
              max={Math.max(120, Math.round((canvas?.width ?? 1000) / 8))}
              value={blurRadius || 24}
              onChange={(event) => setBlurRadius(Number(event.target.value))}
            />
            {blurRadius}px
          </span>
        ) : null}
        <button type="button" className="text-button text-button-sm" onClick={undo}>撤销</button>
        <button type="button" className="text-button text-button-sm" disabled={saving} onClick={() => void save()}>
          {saving ? "保存中..." : "保存修改"}
        </button>
        <button type="button" className="text-button text-button-sm" onClick={onClose}>取消</button>
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "#9fb3c8" }}>
        {tool ? TOOL_LABELS.find((item) => item.id === tool)?.hint : "选择一个编辑工具开始;「保存修改」会覆盖原图,可用「撤销」回退一步"}
        {error ? ` · ${error}` : ""}
      </p>
      <div style={{ position: "relative", maxWidth: "100%" }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ maxWidth: "100%", height: "auto", display: "block", cursor: tool ? "crosshair" : "default", background: "#000" }}
        />
        {dragRect && canvas ? (
          <div style={{ position: "absolute", border: "2px dashed #1f8fff", background: "rgba(31,143,255,.15)", pointerEvents: "none", ...toPercent(dragRect) }} />
        ) : null}
        {textPos && canvas ? (
          <input
            autoFocus
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            onBlur={confirmText}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") confirmText();
              if (event.key === "Escape") setTextPos(null);
            }}
            placeholder="输入批注文字"
            style={{
              position: "absolute",
              left: `${(textPos.x / canvas.width) * 100}%`,
              top: `${(textPos.y / canvas.height) * 100}%`,
              color: textColor,
              fontWeight: 700,
            }}
          />
        ) : null}
      </div>
      {!ready && !error ? <p style={{ color: "#9fb3c8" }}>图片加载中...</p> : null}
    </div>
  );
}

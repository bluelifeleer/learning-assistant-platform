import { assertAssistantOnlyElement } from "../safety/guardrails";

export interface OverlayState {
  adapterName: string;
  courseTitle?: string;
  chapterTitle?: string;
  status: string;
}

export class AssistantOverlay {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;

  constructor() {
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
    this.root.appendChild(this.makeButton("添加笔记", () => this.update({ status: "已准备添加笔记" })));
    this.root.appendChild(this.makeButton("导出字幕", () => this.update({ status: "请到控制台导出字幕" })));
    this.root.appendChild(this.makeButton("高亮下一节", () => this.update({ status: "已请求高亮下一节候选" })));
  }

  mount(): void {
    if (!document.getElementById(this.root.id)) {
      document.documentElement.appendChild(this.root);
    }
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

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = "margin:8px 6px 0 0;padding:6px 8px;border-radius:6px;border:0;background:#1f8fff;color:white;cursor:pointer";
    assertAssistantOnlyElement(button);
    button.addEventListener("click", onClick);
    return button;
  }
}

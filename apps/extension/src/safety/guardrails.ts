const forbiddenActionTexts = [
  "保存学习进度",
  "开始学习",
  "继续学习",
  "下一章",
  "下一节",
  "提交",
  "完成学习",
];

export function isForbiddenPlatformActionText(text: string): boolean {
  const normalized = text.replace(/\s+/g, "");
  return forbiddenActionTexts.some((item) => normalized.includes(item));
}

export function assertAssistantOnlyElement(element: Element): void {
  const text = element.textContent ?? "";
  if (isForbiddenPlatformActionText(text)) {
    throw new Error(`Blocked platform-mutating action: ${text}`);
  }
}

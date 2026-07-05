import { describe, expect, it } from "vitest";
import { isForbiddenPlatformActionText } from "../safety/guardrails";

describe("platform action guardrails", () => {
  it("blocks learning-record mutation actions", () => {
    expect(isForbiddenPlatformActionText("保存学习进度")).toBe(true);
    expect(isForbiddenPlatformActionText("开始学习")).toBe(true);
    expect(isForbiddenPlatformActionText("继续学习")).toBe(true);
    expect(isForbiddenPlatformActionText("下一章")).toBe(true);
  });

  it("allows assistant-only actions", () => {
    expect(isForbiddenPlatformActionText("导出字幕")).toBe(false);
    expect(isForbiddenPlatformActionText("添加笔记")).toBe(false);
  });
});

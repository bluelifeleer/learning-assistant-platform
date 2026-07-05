import { describe, expect, it } from "vitest";
import { isForbiddenPlatformActionText } from "../safety/guardrails";
import { ASSISTANT_OVERLAY_ACTIONS } from "../ui/overlay";

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

  it("allows every overlay action label", () => {
    for (const action of ASSISTANT_OVERLAY_ACTIONS) {
      expect(isForbiddenPlatformActionText(action.label)).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  OVERLAY_MOUNTED_MESSAGE,
  buildOverlayMountedMessage,
  isTrustedOverlayMountedMessage,
} from "../overlayMessage";

const TOKEN = "abcdefghijklmnopabcdefghijklmnop";

describe("overlay mounted message", () => {
  const childFrame = { name: "child" };
  const frames = [childFrame];

  it("accepts a correctly signed message coming from a direct child frame", () => {
    const message = buildOverlayMountedMessage(TOKEN);

    expect(isTrustedOverlayMountedMessage(message, childFrame, frames, TOKEN)).toBe(true);
  });

  it("rejects the legacy bare string that any page script could post", () => {
    // 旧协议只发一个字符串,页面里任意 iframe 发同样内容就能撤掉浮层
    expect(isTrustedOverlayMountedMessage(OVERLAY_MOUNTED_MESSAGE, childFrame, frames, TOKEN)).toBe(false);
  });

  it("rejects a message with a wrong or missing token", () => {
    expect(isTrustedOverlayMountedMessage(buildOverlayMountedMessage("guessed"), childFrame, frames, TOKEN)).toBe(false);
    expect(isTrustedOverlayMountedMessage({ type: OVERLAY_MOUNTED_MESSAGE }, childFrame, frames, TOKEN)).toBe(false);
    expect(isTrustedOverlayMountedMessage(null, childFrame, frames, TOKEN)).toBe(false);
  });

  it("rejects a correctly signed message that did not come from a child frame", () => {
    const message = buildOverlayMountedMessage(TOKEN);

    // 页面自身的脚本(不是子框架)发来的消息不可信
    expect(isTrustedOverlayMountedMessage(message, { name: "self" }, frames, TOKEN)).toBe(false);
    expect(isTrustedOverlayMountedMessage(message, null, frames, TOKEN)).toBe(false);
  });

  it("rejects everything when the runtime token is unavailable", () => {
    const message = buildOverlayMountedMessage("");

    expect(isTrustedOverlayMountedMessage(message, childFrame, frames, "")).toBe(false);
  });
});

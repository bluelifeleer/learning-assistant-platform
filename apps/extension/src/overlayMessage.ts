/** 子框架浮层挂载后通知顶层撤销重复浮层的消息协议。 */
export const OVERLAY_MOUNTED_MESSAGE = "learning-assistant:overlay-mounted";

export interface OverlayMountedMessage {
  type: typeof OVERLAY_MOUNTED_MESSAGE;
  token: string;
}

export function buildOverlayMountedMessage(token: string): OverlayMountedMessage {
  return { type: OVERLAY_MOUNTED_MESSAGE, token };
}

/**
 * 顶层判断一条"浮层已挂载"消息是否可信。
 *
 * 两个条件缺一不可:
 * 1. token 必须是扩展隔离世界里的 runtime.id —— 页面脚本和第三方 iframe 读不到,
 *    所以无法伪造。此前只比对消息字符串,页面里任何一个 iframe 发一条消息就能把浮层撤掉。
 * 2. 来源必须确实是本页的直接子框架,而不是页面自身的脚本。
 */
export function isTrustedOverlayMountedMessage(
  data: unknown,
  source: unknown,
  frames: ArrayLike<unknown>,
  token: string,
): boolean {
  if (!token) return false;
  if (!data || typeof data !== "object") return false;
  const candidate = data as { type?: unknown; token?: unknown };
  if (candidate.type !== OVERLAY_MOUNTED_MESSAGE || candidate.token !== token) return false;
  if (!source) return false;
  try {
    return Array.from(frames).some((frame) => frame === source);
  } catch {
    return false;
  }
}

import {
  handleScreenshotCaptureMessage,
  isScreenshotCaptureRequest,
} from "./backgroundScreenshotCapture";
import { handleSubtitleFetchMessage, isSubtitleFetchRequest } from "./backgroundSubtitleFetch";
import { registerContentScriptReinjection } from "./backgroundReinject";
import { ensureDefaultExtensionConfig } from "./config";
import { registerPeriodicHeartbeat } from "./backgroundHeartbeat";

chrome.runtime.onInstalled.addListener(() => {
  void ensureDefaultExtensionConfig();
});

registerContentScriptReinjection();

// service worker 每次被唤醒都会重新执行顶层代码,在这里注册可保证
// 浏览器运行期间心跳 alarm 始终存在;alarms.create 同名重建是幂等的
registerPeriodicHeartbeat();

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // 仅接受来自本扩展自身的消息(内容脚本/扩展页面),拒绝外部页面冒用特权能力。
  if (sender.id !== chrome.runtime.id) {
    return false;
  }
  if (isSubtitleFetchRequest(message)) {
    void handleSubtitleFetchMessage(message).then(sendResponse);
    return true;
  }
  if (isScreenshotCaptureRequest(message)) {
    void handleScreenshotCaptureMessage(message, sender.tab?.windowId).then(sendResponse);
    return true;
  }
  return false;
});

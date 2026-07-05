import { handleSubtitleFetchMessage, isSubtitleFetchRequest } from "./backgroundSubtitleFetch";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({
    apiBaseUrl: "http://127.0.0.1:17890/api/v1",
    enabledAdapters: ["wencai-school", "generic-video"],
  });
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isSubtitleFetchRequest(message)) return false;

  void handleSubtitleFetchMessage(message).then(sendResponse);
  return true;
});

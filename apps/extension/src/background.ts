chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({
    apiBaseUrl: "http://127.0.0.1:17890/api/v1",
    enabledAdapters: ["wencai-school", "generic-video"],
  });
});

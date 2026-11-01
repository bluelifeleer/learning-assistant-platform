import { adapters } from "./adapters/registry";
import {
  DEFAULT_EXTENSION_CONFIG,
  loadExtensionConfig,
  normalizeCustomAdapters,
  type CustomAdapterConfig,
  type ExtensionConfig,
} from "./config";
import { saveConfigAndReportBinding } from "./optionsActions";
import { reportOptionsHeartbeat } from "./pluginHeartbeat";

const apiBaseUrlInput = document.querySelector<HTMLInputElement>("#apiBaseUrl");
const apiTokenInput = document.querySelector<HTMLInputElement>("#apiToken");
const adapterList = document.querySelector<HTMLDivElement>("#adapterList");
const customAdapterList = document.querySelector<HTMLDivElement>("#customAdapterList");
const addCustomAdapterButton = document.querySelector<HTMLButtonElement>("#addCustomAdapter");
const status = document.querySelector<HTMLParagraphElement>("#status");
const form = document.querySelector<HTMLFormElement>("#optionsForm");
const testButton = document.querySelector<HTMLButtonElement>("#testConnection");
const articleCaptureInput = document.querySelector<HTMLInputElement>("#articleCapture");
const pausedSitesInput = document.querySelector<HTMLTextAreaElement>("#pausedSites");
const privacyModeInput = document.querySelector<HTMLInputElement>("#privacyMode");

let customAdapters: CustomAdapterConfig[] = [];

function setStatus(message: string): void {
  if (status) status.textContent = message;
}

function inputValue(selector: string): string {
  return document.querySelector<HTMLInputElement>(selector)?.value.trim() ?? "";
}

function clearCustomForm(): void {
  for (const selector of [
    "#customName",
    "#customDomain",
    "#customCourseSelector",
    "#customChapterSelector",
    "#customChapterIdAttribute",
    "#customCurrentChapterSelector",
    "#customTranscriptSelector",
    "#customVideoSelector",
  ]) {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (input) input.value = "";
  }
  const idAttribute = document.querySelector<HTMLInputElement>("#customChapterIdAttribute");
  if (idAttribute) idAttribute.value = "data-id";
}

function isSelectorSyntaxValid(selector: string): boolean {
  if (!selector) return true;
  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

function renderAdapters(enabledAdapters: string[]): void {
  if (!adapterList) return;
  adapterList.replaceChildren();
  for (const adapter of adapters) {
    const label = document.createElement("label");
    label.className = "adapter-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = adapter.id;
    checkbox.checked = enabledAdapters.includes(adapter.id);
    label.appendChild(checkbox);
    label.append(` ${adapter.name} (${adapter.id})`);
    adapterList.appendChild(label);
  }
}

function renderCustomAdapters(): void {
  if (!customAdapterList) return;
  customAdapterList.replaceChildren();
  if (customAdapters.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "还没有自定义站点。";
    customAdapterList.appendChild(empty);
    return;
  }
  for (const adapter of customAdapters) {
    const item = document.createElement("div");
    item.className = "custom-adapter-item";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = adapter.enabled !== false;
    enabled.title = "启用这个自定义站点";
    enabled.addEventListener("change", () => {
      adapter.enabled = enabled.checked;
    });
    const title = document.createElement("strong");
    title.textContent = adapter.name;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${adapter.domain} · ${adapter.courseSelector} / ${adapter.chapterSelector}`;
    const spacer = document.createElement("span");
    spacer.className = "spacer";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "删除";
    remove.addEventListener("click", () => {
      customAdapters = customAdapters.filter((entry) => entry.id !== adapter.id);
      renderCustomAdapters();
      setStatus("已删除自定义站点，记得点保存配置");
    });
    item.appendChild(enabled);
    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(spacer);
    item.appendChild(remove);
    customAdapterList.appendChild(item);
  }
}

function addCustomAdapter(): void {
  const name = inputValue("#customName");
  const domain = inputValue("#customDomain");
  const courseSelector = inputValue("#customCourseSelector");
  const chapterSelector = inputValue("#customChapterSelector");
  const chapterIdAttribute = inputValue("#customChapterIdAttribute") || "data-id";
  const currentChapterSelector = inputValue("#customCurrentChapterSelector");
  const transcriptSelector = inputValue("#customTranscriptSelector");
  const videoSelector = inputValue("#customVideoSelector");

  if (!name || !domain || !courseSelector || !chapterSelector) {
    setStatus("名称、域名、课程标题选择器、章节列表选择器都要填写");
    return;
  }
  for (const [label, selector] of [
    ["课程标题", courseSelector],
    ["章节列表", chapterSelector],
    ["当前章节", currentChapterSelector],
    ["字幕", transcriptSelector],
    ["视频", videoSelector],
  ] as const) {
    if (!isSelectorSyntaxValid(selector)) {
      setStatus(`${label}选择器语法不正确：${selector}`);
      return;
    }
  }
  const candidate: CustomAdapterConfig = {
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    domain,
    courseSelector,
    chapterSelector,
    chapterIdAttribute,
    currentChapterSelector: currentChapterSelector || undefined,
    transcriptSelector: transcriptSelector || undefined,
    videoSelector: videoSelector || "video",
    enabled: true,
  };
  const normalized = normalizeCustomAdapters([...customAdapters, candidate]);
  if (normalized.length !== customAdapters.length + 1) {
    setStatus("域名格式不正确，请填 example.com 或完整 URL");
    return;
  }
  customAdapters = normalized;
  renderCustomAdapters();
  clearCustomForm();
  setStatus("已添加自定义站点，记得点保存配置");
}

function readFormConfig(): ExtensionConfig {
  const enabledAdapters = Array.from(adapterList?.querySelectorAll<HTMLInputElement>("input[type='checkbox']:checked") ?? []).map((input) => input.value);
  return {
    apiBaseUrl: apiBaseUrlInput?.value ?? DEFAULT_EXTENSION_CONFIG.apiBaseUrl,
    apiToken: apiTokenInput?.value ?? "",
    enabledAdapters,
    customAdapters,
    articleCapture: articleCaptureInput?.checked === true,
    pausedSites: (pausedSitesInput?.value ?? "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean),
    privacyMode: privacyModeInput?.checked === true,
  };
}

async function init(): Promise<void> {
  const config = await loadExtensionConfig();
  if (apiBaseUrlInput) apiBaseUrlInput.value = config.apiBaseUrl;
  if (apiTokenInput) apiTokenInput.value = config.apiToken;
  renderAdapters(config.enabledAdapters);
  customAdapters = config.customAdapters;
  renderCustomAdapters();
  if (articleCaptureInput) articleCaptureInput.checked = config.articleCapture === true;
  if (pausedSitesInput) pausedSitesInput.value = (config.pausedSites ?? []).join("\n");
  if (privacyModeInput) privacyModeInput.checked = config.privacyMode === true;
  const idAttribute = document.querySelector<HTMLInputElement>("#customChapterIdAttribute");
  if (idAttribute) idAttribute.value = "data-id";
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  setStatus("正在保存配置...");
  void saveConfigAndReportBinding(readFormConfig())
    .then((result) => setStatus(result.message))
    .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "配置保存失败"));
});

testButton?.addEventListener("click", () => {
  const config = readFormConfig();
  void reportOptionsHeartbeat(config)
    .then(() => setStatus("连接成功，插件已上报在线"))
    .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "连接失败"));
});

addCustomAdapterButton?.addEventListener("click", addCustomAdapter);

void init();

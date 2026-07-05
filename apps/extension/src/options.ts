import { adapters } from "./adapters/registry";
import { DEFAULT_EXTENSION_CONFIG, loadExtensionConfig, type ExtensionConfig } from "./config";
import { saveConfigAndReportBinding } from "./optionsActions";
import { reportOptionsHeartbeat } from "./pluginHeartbeat";

const apiBaseUrlInput = document.querySelector<HTMLInputElement>("#apiBaseUrl");
const apiTokenInput = document.querySelector<HTMLInputElement>("#apiToken");
const adapterList = document.querySelector<HTMLDivElement>("#adapterList");
const status = document.querySelector<HTMLParagraphElement>("#status");
const form = document.querySelector<HTMLFormElement>("#optionsForm");
const testButton = document.querySelector<HTMLButtonElement>("#testConnection");

function setStatus(message: string): void {
  if (status) status.textContent = message;
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

function readFormConfig(): ExtensionConfig {
  const enabledAdapters = Array.from(adapterList?.querySelectorAll<HTMLInputElement>("input[type='checkbox']:checked") ?? []).map((input) => input.value);
  return {
    apiBaseUrl: apiBaseUrlInput?.value ?? DEFAULT_EXTENSION_CONFIG.apiBaseUrl,
    apiToken: apiTokenInput?.value ?? "",
    enabledAdapters,
  };
}

async function init(): Promise<void> {
  const config = await loadExtensionConfig();
  if (apiBaseUrlInput) apiBaseUrlInput.value = config.apiBaseUrl;
  if (apiTokenInput) apiTokenInput.value = config.apiToken;
  renderAdapters(config.enabledAdapters);
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

void init();

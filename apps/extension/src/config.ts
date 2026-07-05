export interface ExtensionConfig {
  apiBaseUrl: string;
  apiToken: string;
  enabledAdapters: string[];
}

export const DEFAULT_EXTENSION_CONFIG: ExtensionConfig = {
  apiBaseUrl: "http://127.0.0.1:17890/api/v1",
  apiToken: "",
  enabledAdapters: ["wencai-school", "generic-video"],
};

export function normalizeExtensionConfig(value: Partial<ExtensionConfig> | null | undefined): ExtensionConfig {
  return {
    apiBaseUrl: value?.apiBaseUrl?.trim() || DEFAULT_EXTENSION_CONFIG.apiBaseUrl,
    apiToken: value?.apiToken?.trim() || "",
    enabledAdapters: value?.enabledAdapters?.length ? value.enabledAdapters : DEFAULT_EXTENSION_CONFIG.enabledAdapters,
  };
}

export async function loadExtensionConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get(["apiBaseUrl", "apiToken", "enabledAdapters"]);
  return normalizeExtensionConfig(stored as Partial<ExtensionConfig>);
}

export async function saveExtensionConfig(config: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set(normalizeExtensionConfig(config));
}

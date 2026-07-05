import type { ExtensionConfig } from "./config";

interface HeartbeatResponse {
  ok: boolean;
  status?: number;
}

interface HeartbeatRuntime {
  fetch?: (url: string, init: RequestInit) => Promise<HeartbeatResponse>;
  extensionVersion?: string;
}

function getExtensionVersion(): string {
  return chrome.runtime.getManifest().version;
}

export async function reportOptionsHeartbeat(config: ExtensionConfig, runtime: HeartbeatRuntime = {}): Promise<void> {
  if (!config.apiToken.trim()) {
    throw new Error("插件 Token 未配置");
  }

  const send = runtime.fetch ?? fetch;
  const extensionVersion = runtime.extensionVersion ?? getExtensionVersion();
  const response = await send(`${config.apiBaseUrl}/plugin-heartbeat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiToken}`,
    },
    body: JSON.stringify({
      extension_version: extensionVersion,
      current_url: "extension-options",
      adapter_id: "options",
      adapter_name: "Extension Options",
      enabled_adapters: config.enabledAdapters,
    }),
  });

  if (!response.ok) {
    throw new Error(`连接失败: ${response.status ?? "unknown"}`);
  }
}

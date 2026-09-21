import type { ExtensionConfig } from "./config";

export const HEARTBEAT_ALARM_NAME = "lap-periodic-heartbeat";
export const HEARTBEAT_PERIOD_MINUTES = 1;

interface HeartbeatDeps {
  fetch?: (url: string, init: RequestInit) => Promise<{ ok: boolean }>;
  loadConfig?: () => Promise<ExtensionConfig>;
  extensionVersion?: string;
}

export async function sendBackgroundHeartbeat(deps: HeartbeatDeps = {}): Promise<void> {
  const { loadExtensionConfig } = await import("./config");
  const config = await (deps.loadConfig ?? loadExtensionConfig)();
  if (!config.apiToken.trim()) return;

  const send = deps.fetch ?? fetch;
  const version = deps.extensionVersion ?? chrome.runtime.getManifest().version;
  await send(`${config.apiBaseUrl}/plugin-heartbeat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiToken}`,
    },
    body: JSON.stringify({
      extension_version: version,
      current_url: "extension-background",
      adapter_id: "background",
      adapter_name: "Extension Background",
      enabled_adapters: config.enabledAdapters,
    }),
  }).catch(() => undefined);
}

export function registerPeriodicHeartbeat(
  alarms: Pick<typeof chrome.alarms, "create" | "onAlarm"> = chrome.alarms,
  heartbeat: () => Promise<void> = sendBackgroundHeartbeat,
): void {
  alarms.create(HEARTBEAT_ALARM_NAME, { periodInMinutes: HEARTBEAT_PERIOD_MINUTES });
  alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HEARTBEAT_ALARM_NAME) {
      void heartbeat();
    }
  });
}

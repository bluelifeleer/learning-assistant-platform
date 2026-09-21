import { describe, expect, it, vi } from "vitest";
import { HEARTBEAT_ALARM_NAME, registerPeriodicHeartbeat, sendBackgroundHeartbeat } from "../backgroundHeartbeat";
import type { ExtensionConfig } from "../config";

const config: ExtensionConfig = {
  apiBaseUrl: "http://127.0.0.1:17890/api/v1",
  apiToken: "lap_test",
  enabledAdapters: ["wencai-school"],
};

describe("sendBackgroundHeartbeat", () => {
  it("posts a heartbeat with bearer token", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    await sendBackgroundHeartbeat({
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init! });
        return { ok: true };
      },
      loadConfig: async () => config,
      extensionVersion: "0.1.0",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:17890/api/v1/plugin-heartbeat");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer lap_test");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.adapter_id).toBe("background");
    expect(body.enabled_adapters).toEqual(["wencai-school"]);
  });

  it("skips when token is missing and swallows network errors", async () => {
    const fetcher = vi.fn();
    await sendBackgroundHeartbeat({
      fetch: fetcher,
      loadConfig: async () => ({ ...config, apiToken: "" }),
    });
    expect(fetcher).not.toHaveBeenCalled();

    await expect(
      sendBackgroundHeartbeat({
        fetch: async () => {
          throw new Error("server down");
        },
        loadConfig: async () => config,
        extensionVersion: "0.1.0",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("registerPeriodicHeartbeat", () => {
  it("creates a recurring alarm and routes it to the heartbeat", async () => {
    const created: Array<{ name: string; info: chrome.alarms.AlarmCreateInfo }> = [];
    let listener: ((alarm: chrome.alarms.Alarm) => void) | undefined;
    const alarms = {
      create: (name: string, info: chrome.alarms.AlarmCreateInfo) => created.push({ name, info }),
      onAlarm: { addListener: (fn: (alarm: chrome.alarms.Alarm) => void) => (listener = fn) },
    };
    const heartbeat = vi.fn(async () => undefined);

    registerPeriodicHeartbeat(alarms as unknown as typeof chrome.alarms, heartbeat);

    expect(created).toEqual([{ name: HEARTBEAT_ALARM_NAME, info: { periodInMinutes: 1 } }]);
    listener?.({ name: HEARTBEAT_ALARM_NAME } as chrome.alarms.Alarm);
    expect(heartbeat).toHaveBeenCalledTimes(1);
    listener?.({ name: "other" } as chrome.alarms.Alarm);
    expect(heartbeat).toHaveBeenCalledTimes(1);
  });
});

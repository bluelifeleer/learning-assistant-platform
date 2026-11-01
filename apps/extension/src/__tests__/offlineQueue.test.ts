import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueOfflineCapture, flushOfflineQueue, OFFLINE_QUEUE_KEY } from "../offlineQueue";

function installStorage(initial: Record<string, unknown> = {}): Record<string, unknown> {
  const store = { ...initial };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(store, values);
        }),
      },
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("offline capture queue", () => {
  it("stores a failed note and flushes it later", async () => {
    const store = installStorage();
    await enqueueOfflineCapture("note", "/capture/note", { content: "离线笔记" });
    const queue = store[OFFLINE_QUEUE_KEY] as unknown[];
    expect(queue).toHaveLength(1);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ note_id: "n1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await flushOfflineQueue({ apiBaseUrl: "http://127.0.0.1:17890/api/v1", apiToken: "t" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/capture/note",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ content: "离线笔记" }) }),
    );
    expect(store[OFFLINE_QUEUE_KEY]).toEqual([]);
  });

  it("keeps entries on server errors and drops invalid requests", async () => {
    const store = installStorage({
      [OFFLINE_QUEUE_KEY]: [
        { id: "a", kind: "note", path: "/capture/note", body: {}, createdAt: 1, size: 0 },
      ],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await flushOfflineQueue({ apiBaseUrl: "http://127.0.0.1:17890/api/v1", apiToken: "t" });
    expect(store[OFFLINE_QUEUE_KEY]).toHaveLength(1);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({}) }));
    await flushOfflineQueue({ apiBaseUrl: "http://127.0.0.1:17890/api/v1", apiToken: "t" });
    expect(store[OFFLINE_QUEUE_KEY]).toEqual([]);
  });
});

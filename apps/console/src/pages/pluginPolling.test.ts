import { afterEach, describe, expect, it, vi } from "vitest";
import { startPluginStatusPolling } from "./pluginPolling";

describe("plugin status polling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes immediately, repeats, and stops cleanly", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();

    const stop = startPluginStatusPolling(refresh, 1000);

    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(2);

    stop();
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

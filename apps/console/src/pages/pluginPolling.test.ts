import { afterEach, describe, expect, it, vi } from "vitest";
import { startPluginStatusPolling } from "./pluginPolling";

describe("plugin status polling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes immediately, repeats after each round completes, and stops cleanly", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);

    const stop = startPluginStatusPolling(refresh, 1000);

    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not overlap a slow refresh with the next round", async () => {
    vi.useFakeTimers();
    let resolveRefresh: (() => void) | undefined;
    const refresh = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const stop = startPluginStatusPolling(refresh, 1000);

    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveRefresh?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);

    stop();
  });

  it("aborts the in-flight request when stopped", () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const refresh = vi.fn().mockImplementation((signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<void>(() => {});
    });

    const stop = startPluginStatusPolling(refresh, 1000);

    expect(capturedSignal?.aborted).toBe(false);
    stop();
    expect(capturedSignal?.aborted).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import { reinjectMissingContentScripts } from "../backgroundReinject";

function makeTabs(
  tabs: Array<{ id?: number; url?: string }>,
  sendMessage: (tabId: number) => Promise<unknown>,
) {
  return {
    query: vi.fn().mockResolvedValue(tabs),
    sendMessage: vi.fn((tabId: number) => sendMessage(tabId)),
  };
}

describe("reinjectMissingContentScripts", () => {
  it("reinjects tabs that do not answer the ping and keeps alive tabs untouched", async () => {
    const tabs = makeTabs(
      [
        { id: 1, url: "https://school.example.com/course" },
        { id: 2, url: "https://alive.example.com/" },
      ],
      (tabId) => (tabId === 2 ? Promise.resolve({ ok: true }) : Promise.reject(new Error("Could not establish connection"))),
    );
    const executeScript = vi.fn().mockResolvedValue(undefined);

    const injected = await reinjectMissingContentScripts(tabs, { executeScript });

    expect(injected).toBe(1);
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 1, allFrames: true }, files: ["dist/content.js"] });
  });

  it("skips the local console tab even when nothing answers there", async () => {
    const tabs = makeTabs(
      [{ id: 3, url: "http://127.0.0.1:17891/" }],
      () => Promise.reject(new Error("Could not establish connection")),
    );
    const executeScript = vi.fn();

    const injected = await reinjectMissingContentScripts(tabs, { executeScript });

    expect(injected).toBe(0);
    expect(executeScript).not.toHaveBeenCalled();
    expect(tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("ignores pages where script injection is blocked", async () => {
    const tabs = makeTabs(
      [{ id: 4, url: "https://chrome.google.com/webstore" }],
      () => Promise.reject(new Error("Could not establish connection")),
    );
    const executeScript = vi.fn().mockRejectedValue(new Error("Cannot access contents of the page"));

    const injected = await reinjectMissingContentScripts(tabs, { executeScript });

    expect(injected).toBe(0);
  });
});

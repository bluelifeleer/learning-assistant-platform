import { describe, expect, it } from "vitest";
import { formatPluginBindingState, getPluginBindingState } from "./pluginStatus";

describe("plugin binding status", () => {
  it("shows online when any plugin client is online", () => {
    expect(getPluginBindingState([{ id: "edge", name: "Edge local", online: true, enabled_adapters: [] }])).toBe("online");
    expect(formatPluginBindingState("online")).toBe("在线");
  });

  it("shows offline when known clients are not online", () => {
    expect(getPluginBindingState([{ id: "edge", name: "Edge local", online: false, enabled_adapters: [] }])).toBe("offline");
  });

  it("shows unbound before any client exists", () => {
    expect(getPluginBindingState([])).toBe("unbound");
  });
});

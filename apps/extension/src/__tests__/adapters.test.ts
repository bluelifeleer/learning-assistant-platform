import { describe, expect, it } from "vitest";
import { pickAdapter } from "../adapters/registry";

describe("adapter registry", () => {
  it("selects wencai adapter for wencai learning domains", () => {
    const adapter = pickAdapter(new URL("https://learning.wencaischool.net/openlearning/console/"));
    expect(adapter.id).toBe("wencai-school");
  });

  it("falls back to generic video adapter for unknown sites", () => {
    const adapter = pickAdapter(new URL("https://example.com/course/video"));
    expect(adapter.id).toBe("generic-video");
  });

  it("respects enabled adapter ids", () => {
    const adapter = pickAdapter(new URL("https://learning.wencaischool.net/openlearning/console/"), ["generic-video"]);
    expect(adapter.id).toBe("generic-video");
  });
});

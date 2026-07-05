import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "..", "styles.css"), "utf-8");

describe("console layout styles", () => {
  it("prevents long plugin tokens and urls from stretching dashboard cards", () => {
    expect(css).toContain("grid-template-columns: 248px minmax(0, 1fr)");
    expect(css).toContain("min-width: 0");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("overflow: hidden");
  });
});

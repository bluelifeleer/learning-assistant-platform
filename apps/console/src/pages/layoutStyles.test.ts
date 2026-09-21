import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "..", "styles.css"), "utf-8");

describe("console layout styles", () => {
  it("uses the redesigned app shell with a fixed sidebar column and flexible workspace", () => {
    expect(css).toContain("grid-template-columns: 252px minmax(0, 1fr)");
    expect(css).toContain(".app-shell");
    expect(css).toContain(".workspace");
  });

  it("defines the design token palette", () => {
    expect(css).toContain("--primary: #2563eb");
    expect(css).toContain("--bg: #f4f6fa");
    expect(css).toContain("--sidebar-bg: #0e1a2b");
  });

  it("prevents long plugin tokens and urls from stretching dashboard cards", () => {
    expect(css).toContain("min-width: 0");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("overflow: hidden");
    expect(css).toContain("overflow-wrap: anywhere");
  });

  it("keeps a mobile collapse for the shell below 900px", () => {
    expect(css).toContain("@media (max-width: 900px)");
  });
});

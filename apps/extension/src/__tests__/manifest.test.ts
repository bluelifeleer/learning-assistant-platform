import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const extensionRoot = resolve(__dirname, "..", "..");
const manifest = JSON.parse(readFileSync(resolve(extensionRoot, "manifest.json"), "utf-8"));

describe("extension manifest", () => {
  it("injects the content script into normal pages and frames", () => {
    const [contentScript] = manifest.content_scripts;

    expect(contentScript.matches).toContain("https://*/*");
    expect(contentScript.matches).toContain("http://*/*");
    expect(contentScript.js).toContain("dist/content.js");
    expect(contentScript.all_frames).toBe(true);
  });

  it("does not inject into the local console", () => {
    const [contentScript] = manifest.content_scripts;

    expect(contentScript.exclude_matches).toContain("http://127.0.0.1:17891/*");
    expect(contentScript.exclude_matches).toContain("http://localhost:17891/*");
  });

  it("points to generated loadable scripts after build", () => {
    expect(existsSync(resolve(extensionRoot, "dist", "content.js"))).toBe(true);
    expect(existsSync(resolve(extensionRoot, "dist", "background.js"))).toBe(true);
  });
});

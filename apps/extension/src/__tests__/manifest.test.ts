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

  it("points background and content scripts at bundled outputs", () => {
    expect(manifest.background.service_worker).toBe("dist/background.js");
    expect(manifest.content_scripts[0].js).toContain("dist/content.js");
  });

  it("requests the permissions required by captureVisibleTab", () => {
    expect(manifest.permissions).toContain("activeTab");
    expect(manifest.host_permissions).toContain("<all_urls>");
  });

  it("declares store-ready extension icons", () => {
    expect(manifest.icons).toEqual({
      "16": "assets/icon-16.png",
      "32": "assets/icon-32.png",
      "48": "assets/icon-48.png",
      "128": "assets/icon-128.png",
    });

    for (const iconPath of Object.values<string>(manifest.icons)) {
      expect(existsSync(resolve(extensionRoot, iconPath))).toBe(true);
    }
  });
});

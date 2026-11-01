/**
 * 把构建后的扩展打成可上传 Chrome Web Store / Edge Add-ons 的 zip。
 *
 * 依赖系统 zip 命令（macOS/Linux 自带）。产物在 apps/extension/dist/ 下，
 * 不包含源码、sourcemap 和本地测试文件。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, "..", "apps", "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "manifest.json"), "utf-8"));
const out = path.join(extensionDir, "dist", `learning-assistant-extension-${manifest.version}.zip`);

for (const required of ["manifest.json", "options.html", "dist/background.js", "dist/content.js", "dist/options.js", "assets/icon-128.png"]) {
  if (!fs.existsSync(path.join(extensionDir, required))) {
    console.error(`[package] 缺少 ${required}，请先运行 apps/extension 的 build`);
    process.exit(1);
  }
}
fs.rmSync(out, { force: true });

const files = [
  "manifest.json",
  "options.html",
  "dist/background.js",
  "dist/content.js",
  "dist/options.js",
  "assets",
];
execFileSync("zip", ["-r", "-q", out, ...files], { cwd: extensionDir, stdio: "inherit" });
console.log(`[package] ${out}`);

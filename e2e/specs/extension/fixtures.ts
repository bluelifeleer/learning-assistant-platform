import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test as base, chromium, type BrowserContext } from "@playwright/test";

/**
 * 扩展用例的 fixture：用持久化上下文加载 apps/extension/dist。
 *
 * 扩展只能在有 GUI 的 Chromium 里加载（headless 的新模式支持 --load-extension，
 * 这里仍用默认有头/无头由环境决定），所以不用 Playwright 默认的 page fixture。
 */
export const EXTENSION_DIR = path.join(process.cwd(), "apps", "extension");

export interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
}

export function buildExtension(): void {
  const outputs = ["dist/content.js", "dist/background.js", "dist/options.js"].map((file) =>
    path.join(EXTENSION_DIR, file),
  );
  if (outputs.every((file) => fs.existsSync(file))) return;
  console.log("[e2e] 构建扩展（apps/extension/dist 缺失）");
  execFileSync("pnpm", ["--filter", "@learn-assistant/extension", "build"], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    buildExtension();
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--load-extension=${EXTENSION_DIR}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // service worker 可能稍晚才启动
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
    const id = worker.url().split("/")[2];
    await use(id);
  },
});

export const expect = test.expect;

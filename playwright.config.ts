import { defineConfig, devices } from "@playwright/test";

/**
 * e2e 配置。
 *
 * - 后端：e2e/scripts/start-api.mjs → 独立 sqlite 库（e2e/.tmp/e2e.db）+ 种子数据，端口 17899
 * - 前端：e2e/scripts/start-console.mjs → vite dev，端口 17892，API 指向 17899
 *
 * 本地（非 CI）会复用已经起着的服务，省去每次重启；CI 里强制新起。
 */
const API_URL = "http://127.0.0.1:17899/api/v1/health";
const CONSOLE_URL = "http://127.0.0.1:17892";
const SITE_URL = "http://127.0.0.1:17893/learn/course.html";

export default defineConfig({
  testDir: "./e2e/specs",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // 后台任务会写同一个库，串行更稳
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: CONSOLE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "console",
      testDir: "./e2e/specs/console",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "extension",
      testDir: "./e2e/specs/extension",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e/scripts/start-api.mjs",
      url: API_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "node e2e/scripts/start-console.mjs",
      url: CONSOLE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "node e2e/scripts/start-site.mjs",
      url: SITE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});

/**
 * e2e 专用控制台启动器：vite dev（独立端口 17892），API 指向 e2e 的 17899。
 * 不改 apps/console 的 dev 脚本本身。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const consoleDir = path.join(root, "apps", "console");
const isWindows = process.platform === "win32";

const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const env = {
  ...process.env,
  VITE_API_BASE_URL: "http://127.0.0.1:17899/api/v1",
  BROWSER: "none",
};

if (!fs.existsSync(path.join(consoleDir, "node_modules"))) {
  console.error("[e2e] apps/console/node_modules 不存在，先在仓库根跑 pnpm install");
  process.exit(1);
}

const server = spawn(
  pnpm,
  ["exec", "vite", "--host", "127.0.0.1", "--port", "17892", "--strictPort"],
  { cwd: consoleDir, env, stdio: "inherit", shell: isWindows },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));

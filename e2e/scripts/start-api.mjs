/**
 * e2e 专用 API 启动器：准备一个独立的 sqlite 库（迁移 + 种子），再起 uvicorn。
 *
 * 绝不连接真实数据库：所有路径都在 e2e/.tmp 下，端口用 17899 避开开发端口。
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const apiDir = path.join(root, "apps", "api");
const tmp = path.join(root, "e2e", ".tmp");
const isWindows = process.platform === "win32";

const python =
  process.env.E2E_PYTHON ||
  (isWindows ? path.join(apiDir, ".venv", "Scripts", "python.exe") : path.join(apiDir, ".venv", "bin", "python"));

if (!fs.existsSync(python)) {
  console.error(`[e2e] 找不到 Python 解释器：${python}（先跑安装步骤，或设置 E2E_PYTHON）`);
  process.exit(1);
}

fs.mkdirSync(tmp, { recursive: true });
// 每次运行都从空库开始，避免上一条用例的残留影响断言
const dbPath = path.join(tmp, "e2e.db");
for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(dbPath + suffix, { force: true });
}
const dbFile = dbPath.replace(/\\/g, "/");
const env = {
  ...process.env,
  APP_ENV: "test",
  DATABASE_TYPE: "sqlite",
  DATABASE_URL: `sqlite+pysqlite:///${dbFile}`,
  API_HOST: "127.0.0.1",
  API_PORT: "17899",
  ALLOW_REGISTRATION: "true",
  API_TOKEN_PEPPER: "e2e-only-pepper-0123456789abcdef",
  EXPORT_DIR: path.join(tmp, "exports"),
  SCREENSHOTS_DIR: path.join(tmp, "screenshots"),
  NOTE_IMAGES_DIR: path.join(tmp, "note_images"),
  DIGEST_SCHEDULER_ENABLED: "false",
  EXPORT_CLEANUP_ENABLED: "false",
  JOB_RECOVERY_GRACE_SECONDS: "0",
  PYTHONIOENCODING: "utf-8",
};

function step(label, args, cwd) {
  console.log(`[e2e] ${label}`);
  const result = spawnSync(python, args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[e2e] ${label} 失败（exit ${result.status}）`);
    process.exit(result.status ?? 1);
  }
}

step("alembic upgrade head", ["-m", "alembic", "upgrade", "head"], apiDir);
step("种子数据", [path.join(root, "scripts", "seed_e2e.py")], root);

const server = spawn(
  python,
  ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "17899", "--log-level", "warning"],
  { cwd: apiDir, env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill(signal);
  });
}
server.on("exit", (code) => process.exit(code ?? 0));

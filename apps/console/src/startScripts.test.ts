import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function script(name: string): string {
  return resolve(repoRoot, "scripts", name);
}

describe("cross-platform start scripts", () => {
  it("provides a POSIX dev launcher for macOS and Linux", () => {
    const path = script("dev.sh");

    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("#!/usr/bin/env bash");
    expect(content).toContain("set -euo pipefail");
    expect(content).toContain('API_PORT="${API_PORT:-17890}"');
    expect(content).toContain('CONSOLE_PORT="${CONSOLE_PORT:-17891}"');
    expect(content).toContain('uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT"');
    expect(content).toContain("pnpm --filter @learn-assistant/console dev");
    expect(content).toContain('CONSOLE_URL="http://127.0.0.1:${CONSOLE_PORT}"');
  });

  it("provides Unix database and desktop start wrappers", () => {
    for (const name of ["db-docker.sh", "start-linux.sh", "start-macos.command"]) {
      expect(existsSync(script(name)), `${name} should exist`).toBe(true);
    }

    expect(readFileSync(script("db-docker.sh"), "utf-8")).toContain("docker compose --profile");
    expect(readFileSync(script("start-linux.sh"), "utf-8")).toContain("scripts/dev.sh");
    expect(readFileSync(script("start-macos.command"), "utf-8")).toContain("scripts/dev.sh");
  });
});

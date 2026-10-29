import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { login, openPage } from "./helpers";

/**
 * 导入导出：导出完整包 → 把包再导入回来（预览 + 合并）。
 * 这条路径最容易在真实浏览器里暴露问题（下载、文件选择、轮询进度）。
 */

const TMP = path.join(process.cwd(), "e2e", ".tmp");
const EXPORT_FILE = path.join(TMP, "e2e-roundtrip.lapkg");

test.describe("导入导出", () => {
  test("导出完整包，再导入回来", async ({ page }) => {
    fs.mkdirSync(TMP, { recursive: true });
    await login(page);
    await openPage(page, "导入导出");

    // 默认格式就是完整包，直接创建并等下载
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.getByRole("button", { name: "创建导出" }).click(),
    ]);
    await download.saveAs(EXPORT_FILE);

    const stats = fs.statSync(EXPORT_FILE);
    expect(stats.size).toBeGreaterThan(5_000);

    // 上传刚导出的包，先预览
    await page.locator('input[type="file"]').setInputFiles(EXPORT_FILE);
    await page.getByRole("button", { name: "预览（不写入）" }).click();
    await expect(page.getByText(/预览完成/)).toBeVisible({ timeout: 120_000 });

    // 再真正导入（merge 策略不会产生副本）
    await page.getByRole("button", { name: "确认导入", exact: true }).click();
    await expect(page.getByText(/导入完成/)).toBeVisible({ timeout: 120_000 });

    // 导入记录里应出现两条成功记录（预览 + 正式）
    await expect(page.getByText("已完成").first()).toBeVisible();
  });

  test("导出记录支持手动清理入口", async ({ page }) => {
    await login(page);
    await openPage(page, "导入导出");

    await expect(page.getByText("保留最近")).toBeVisible();
    await expect(page.getByRole("button", { name: "清理更早的导出" })).toBeVisible();
  });
});

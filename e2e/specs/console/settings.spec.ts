import { expect, test } from "@playwright/test";
import { login, openPage } from "./helpers";

test.describe("系统设置", () => {
  test("设置页只有一个标题，并能保存组织与授权设置", async ({ page }) => {
    await login(page);
    await openPage(page, "系统设置");

    // 之前 SystemSettings 与内嵌的 Settings 各渲染一个"系统设置"标题，现在只保留外层
    await expect(page.getByRole("heading", { name: "系统设置", level: 2 })).toHaveCount(1);

    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("设置已保存")).toBeVisible();
  });

  test("设置页提供全部标签页", async ({ page }) => {
    await login(page);
    await openPage(page, "系统设置");

    for (const tab of ["设置", "插件管理", "站点适配器", "用户与授权", "操作日志"]) {
      await expect(page.getByRole("tab", { name: tab, exact: true })).toBeVisible();
    }

    await page.getByRole("tab", { name: "操作日志", exact: true }).click();
    await expect(page.getByRole("tab", { name: "操作日志", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("AI 设置区能切换预设厂商", async ({ page }) => {
    await login(page);
    await openPage(page, "系统设置");

    const preset = page.getByRole("combobox").first();
    await preset.selectOption("kimi");

    await expect(page.getByRole("heading", { name: "AI 设置" })).toBeVisible();
  });
});

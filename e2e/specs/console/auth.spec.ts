import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * 登录与总览。顺便验证种子数据可用——后面所有用例都复用这里的登录方式。
 */

const seed = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "e2e", ".tmp", "seed.json"), "utf-8"),
) as { email: string; password: string; organization: string };

export async function login(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("邮箱").fill(seed.email);
  await page.locator('input[autocomplete="current-password"]').fill(seed.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}

test.describe("登录与总览", () => {
  test("未登录时只看到登录表单", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "登录学习助手" })).toBeVisible();
    await expect(page.getByLabel("邮箱")).toBeVisible();
    // 未登录不该出现导航
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  test("密码错误时给出提示且不进控制台", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("邮箱").fill(seed.email);
    await page.locator('input[autocomplete="current-password"]').fill("wrong-password-123");
    await page.getByRole("button", { name: "登录", exact: true }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  test("正确密码进入总览，导航项齐全", async ({ page }) => {
    await login(page);

    for (const label of ["总览", "课程", "笔记", "复习", "测验", "搜索", "导入导出", "系统设置"]) {
      await expect(page.getByRole("navigation").getByText(label, { exact: true })).toBeVisible();
    }
    // 总览页有统计卡片
    await expect(page.getByRole("heading", { name: "总览" })).toBeVisible();
  });

  test("显示密码开关能切换输入框类型", async ({ page }) => {
    await page.goto("/");
    const password = page.locator('input[autocomplete="current-password"]');

    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "显示密码" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "隐藏密码" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("退出后回到登录页", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "退出" }).click();

    await expect(page.getByRole("heading", { name: "登录学习助手" })).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });
});

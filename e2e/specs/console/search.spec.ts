import { expect, test } from "@playwright/test";
import { login, openPage } from "./helpers";

test.describe("搜索", () => {
  test("同时搜到笔记与字幕，并显示出处", async ({ page }) => {
    await login(page);
    await openPage(page, "搜索");

    await page.getByPlaceholder("搜索笔记与字幕").fill("线性规划");
    await page.getByRole("main").getByRole("button", { name: "搜索", exact: true }).click();

    // 分组标题带命中数量
    await expect(page.getByRole("heading", { name: /^笔记 \(\d+\)$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^字幕 \(\d+\)$/ })).toBeVisible();
    await expect(page.getByText("E2E 笔记：线性规划的可行域是凸集。")).toBeVisible();
    await expect(page.getByText(/线性规划 第 1 段/)).toBeVisible();
    // 结果行（role=link）带"课程 / 章节"出处
    await expect(page.getByRole("link").filter({ hasText: "E2E 运筹学" }).first()).toBeVisible();
  });

  test("没有结果时给出空态提示", async ({ page }) => {
    await login(page);
    await openPage(page, "搜索");

    await page.getByPlaceholder("搜索笔记与字幕").fill("完全不存在的关键词xyz");
    await page.getByRole("main").getByRole("button", { name: "搜索", exact: true }).click();

    await expect(page.getByText("没有匹配的结果。")).toBeVisible();
  });
});

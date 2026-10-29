import { expect, test } from "@playwright/test";
import { login, openPage, opsCourse } from "./helpers";

test.describe("课程", () => {
  test("列表展示种子课程，进入详情能看到章节树", async ({ page }) => {
    await login(page);
    await openPage(page, "课程");

    await expect(page.getByText("E2E 运筹学")).toBeVisible();
    await expect(page.getByText("E2E 数据结构")).toBeVisible();

    await page.getByRole("link").filter({ hasText: "E2E 运筹学" }).click();

    await expect(page.getByRole("heading", { name: "课程详情" })).toBeVisible();
    for (const chapter of opsCourse.chapters) {
      // 章节是带状态徽标的按钮："线性规划 ✓ 字 ✎ 题"
      await expect(page.getByRole("button", { name: new RegExp(chapter.title) }).first()).toBeVisible();
    }
    // 选中第一章后能看到字幕列表
    await expect(page.getByRole("heading", { name: "字幕" })).toBeVisible();
  });

  test("可以按关键词筛选课程", async ({ page }) => {
    await login(page);
    await openPage(page, "课程");

    await page.getByPlaceholder("搜索课程名 / 学期 / 站点").fill("数据结构");

    await expect(page.getByText("E2E 数据结构")).toBeVisible();
    await expect(page.getByText("E2E 运筹学")).toHaveCount(0);
  });

  test("归档后默认列表不再显示，切到已归档能看到", async ({ page }) => {
    await login(page);
    await openPage(page, "课程");

    const card = page.getByRole("link").filter({ hasText: "E2E 数据结构" });
    await card.getByRole("button", { name: "归档", exact: true }).click();

    await expect(page.getByText("E2E 数据结构")).toHaveCount(0);

    await page.getByRole("combobox").filter({ hasText: "在读" }).selectOption({ label: "已归档" });
    await expect(page.getByText("E2E 数据结构")).toBeVisible();

    // 还原状态，避免影响后续用例
    await page.getByRole("link").filter({ hasText: "E2E 数据结构" }).getByRole("button", { name: "恢复" }).click();
  });
});

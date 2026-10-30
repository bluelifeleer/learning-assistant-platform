import { expect, test } from "@playwright/test";
import { login, openPage, opsCourse, resetSeedCourses } from "./helpers";

test.beforeEach(async ({ request }) => {
  // 共享测试库：保证每个用例开始时课程都是"在读"，避免互相污染
  await resetSeedCourses(request);
});

test.describe("课程", () => {
  test("列表展示种子课程，进入详情能看到章节树", async ({ page }) => {
    await login(page);
    await openPage(page, "课程");

    await expect(page.getByText("E2E 运筹学")).toBeVisible();
    await expect(page.getByText("E2E 数据结构")).toBeVisible();

    // 回归：操作按钮不能把标题挤成竖排（标题宽度必须明显大于高度）
    const titleBox = await page.locator(".course-card-title").first().boundingBox();
    expect(titleBox).not.toBeNull();
    expect(titleBox!.width).toBeGreaterThan(150);
    expect(titleBox!.width).toBeGreaterThan(titleBox!.height * 2);

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

  test("卡片上的归档/恢复按钮可用，归档后默认列表不再显示", async ({ page }) => {
    await login(page);
    await openPage(page, "课程");

    const card = () => page.getByRole("link").filter({ hasText: "E2E 数据结构" });

    // 卡片操作按钮是悬停才显形的，先 hover 再点
    await card().hover();
    await card().getByRole("button", { name: "归档", exact: true }).click();

    // 用卡片 locator 断言：toast 文案里也会出现课程名，直接 getByText 会撞上
    await expect(card()).toHaveCount(0);

    await page.getByRole("combobox", { name: "状态" }).selectOption({ label: "已归档" });
    await expect(card()).toBeVisible();
    await card().hover();
    await card().getByRole("button", { name: "恢复", exact: true }).click();

    // 恢复后切回"在读"应该能看到
    await page.getByRole("combobox", { name: "状态" }).selectOption({ label: "在读" });
    await expect(card()).toBeVisible();
  });
});

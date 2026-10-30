import { expect, test } from "@playwright/test";
import { login, openPage, opsCourse, pickCourse, resetSeedCourses } from "./helpers";

test.beforeEach(async ({ request }) => {
  // 共享测试库：课程被别的用例归档后，这里会看到空列表
  await resetSeedCourses(request);
});

test.describe("测验", () => {
  test("选课程后开始测验，答对一题并进入下一题", async ({ page }) => {
    await login(page);
    await openPage(page, "测验");
    await pickCourse(page, opsCourse.title);

    await page.getByRole("button", { name: "开始测验" }).click();

    await expect(page.getByText("E2E 题目：线性规划的可行域是什么形状？")).toBeVisible();
    await page.getByRole("button", { name: "凸集", exact: true }).click();
    await page.getByRole("button", { name: "提交答案" }).click();

    await expect(page.getByText("回答正确")).toBeVisible();
    await page.getByRole("button", { name: "下一题" }).click();
    // 第二题是判断题
    await expect(page.getByText("E2E 判断题：对偶问题一定可行。")).toBeVisible();
  });

  test("题目管理列出题目并支持编辑态", async ({ page }) => {
    await login(page);
    await openPage(page, "测验");
    await pickCourse(page, opsCourse.title);

    await page.getByRole("button", { name: "管理题目" }).click();

    await expect(page.getByRole("heading", { name: "题目管理" })).toBeVisible();
    await expect(page.getByText("E2E 题目：线性规划的可行域是什么形状？")).toBeVisible();
    await expect(page.getByRole("button", { name: "清空当前范围" })).toBeVisible();

    // 进入编辑态但不保存，避免污染后续用例
    await page.getByRole("button", { name: "编辑" }).first().click();
    await expect(page.getByRole("button", { name: "保存" })).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByRole("button", { name: "保存" })).toHaveCount(0);
  });
});

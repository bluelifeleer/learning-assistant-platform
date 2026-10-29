import { expect, test } from "@playwright/test";
import { login, openPage } from "./helpers";

test.describe("笔记", () => {
  test("笔记页列出种子笔记并可搜索", async ({ page }) => {
    await login(page);
    await openPage(page, "笔记");

    await expect(page.getByText("E2E 笔记：线性规划的可行域是凸集。")).toBeVisible();
    await expect(page.getByText("E2E 笔记：对偶问题的最优值相等。")).toBeVisible();
    await expect(page.getByText("E2E 笔记：树的遍历有三种顺序。")).toBeVisible();

    await page.getByPlaceholder("搜索笔记内容 / 课程 / 章节 / 标签").fill("对偶");

    await expect(page.getByText("E2E 笔记：对偶问题的最优值相等。")).toBeVisible();
    await expect(page.getByText("E2E 笔记：线性规划的可行域是凸集。")).toHaveCount(0);
  });

  test("按标签筛选", async ({ page }) => {
    await login(page);
    await openPage(page, "笔记");

    await page.getByPlaceholder("搜索笔记内容 / 课程 / 章节 / 标签").fill("考点");

    await expect(page.getByText("E2E 笔记：线性规划的可行域是凸集。")).toBeVisible();
    await expect(page.getByText("E2E 笔记：对偶问题的最优值相等。")).toHaveCount(0);
  });
});

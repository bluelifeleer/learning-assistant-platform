import { expect, test } from "@playwright/test";
import { login, openPage, resetDueCards } from "./helpers";

test.beforeEach(async ({ request }) => {
  // 共享测试库：上一轮"记得"会把卡片到期时间推后，这里重置成现在到期
  await resetDueCards(request);
});

test.describe("复习", () => {
  test("抽认一张卡片：显示答案后选择记得", async ({ page }) => {
    await login(page);
    await openPage(page, "复习");

    await expect(page.getByRole("button", { name: "显示答案" }).first()).toBeVisible();
    await page.getByRole("button", { name: "显示答案" }).first().click();

    await expect(page.getByRole("button", { name: "记得" })).toBeVisible();
    await expect(page.getByRole("button", { name: "忘了" })).toBeVisible();

    await page.getByRole("button", { name: "记得" }).click();

    // 答完回到"下一张"的抽取态，或者提示本次完成
    await expect(
      page.getByRole("button", { name: "显示答案" }).or(page.getByText(/完成|没有到期/)),
    ).toBeVisible();
  });
});

import { expect, test } from "./fixtures";

const SITE = "http://127.0.0.1:17893/learn/course.html";

/**
 * 注入：content script 在命中适配器的页面上挂浮层（id=learning-assistant-overlay）。
 * 未绑定 Token 时提示"配置不完整"；绑定后浮层状态改为已更新/已连接。
 */
test("命中适配器的页面会挂载浮层并提示配置不完整", async ({ context }) => {
  const page = await context.newPage();
  await page.goto(SITE);

  const overlay = page.locator("#learning-assistant-overlay");
  await expect(overlay).toBeVisible({ timeout: 20_000 });
  await expect(overlay).toContainText("学习助手");
  await expect(overlay).toContainText(/插件配置不完整|请先在扩展选项中完成插件绑定/);
  // 浮层按钮齐全
  for (const label of ["添加笔记", "导出字幕", "截图存证"]) {
    await expect(overlay.getByRole("button", { name: label })).toBeVisible();
  }
});

test("在选项页绑定后，浮层状态不再提示配置不完整", async ({ context, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator("#apiBaseUrl").fill("http://127.0.0.1:17899/api/v1");
  await options.locator("#apiToken").fill("la_e2e_token");
  await options.getByRole("button", { name: "保存配置" }).click();
  await expect(options.locator("#status")).toHaveText(/配置已保存/);

  const page = await context.newPage();
  await page.goto(SITE);

  const overlay = page.locator("#learning-assistant-overlay");
  await expect(overlay).toBeVisible({ timeout: 20_000 });
  // 绑定后不再提示"配置不完整"，并且能看到适配器与课程信息。
  // 用的是假 token，所以连接状态可能是"本地服务未连接"——这里只关心配置已生效。
  await expect(overlay).not.toContainText("插件配置不完整");
  await expect(overlay).toContainText("适配器: Generic DOM Course");
  await expect(overlay).toContainText("课程: E2E 假学习站点");
});

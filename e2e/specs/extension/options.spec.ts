import { expect, test } from "./fixtures";

/**
 * 选项页：加载、表单、保存。不依赖后端（保存时不填 Token 就不会发起绑定请求）。
 */
test("选项页能打开并列出适配器", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.getByRole("heading", { name: "Learning Assistant 插件配置" })).toBeVisible();
  await expect(page.locator("#apiBaseUrl")).toBeVisible();
  await expect(page.locator("#apiToken")).toBeVisible();
  // 三个内置适配器都列出来
  await expect(page.locator("#adapterList input[type='checkbox']")).toHaveCount(3);
  await expect(page.getByText("generic-video")).toBeVisible();
});

test("保存配置：没填 Token 时提示先去绑定", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await page.locator("#apiBaseUrl").fill("http://127.0.0.1:17899/api/v1");
  await page.locator("#apiToken").fill("");
  await page.getByRole("button", { name: "保存配置" }).click();

  await expect(page.locator("#status")).toHaveText(/配置已保存|请填写插件 Token/);
});

test("保存的配置会被重新打开时读回", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator("#apiBaseUrl").fill("http://127.0.0.1:17899/api/v1");
  await page.locator("#apiToken").fill("la_e2e_token");
  await page.getByRole("button", { name: "保存配置" }).click();
  await expect(page.locator("#status")).toHaveText(/配置已保存/);

  await page.reload();

  await expect(page.locator("#apiBaseUrl")).toHaveValue("http://127.0.0.1:17899/api/v1");
  await expect(page.locator("#apiToken")).toHaveValue("la_e2e_token");
});

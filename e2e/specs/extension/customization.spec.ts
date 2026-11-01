import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const SITE = "http://127.0.0.1:17893/learn/course.html";
const ARTICLE = "http://127.0.0.1:17893/docs/article.html";

async function openOptions(context: BrowserContext, extensionId: string): Promise<Page> {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator("#apiBaseUrl").fill("http://127.0.0.1:17899/api/v1");
  await options.locator("#apiToken").fill("la_e2e_token");
  return options;
}

test("自定义站点 selector 生效，并优先于内置 adapter", async ({ context, extensionId }) => {
  const options = await openOptions(context, extensionId);
  await options.locator("#customName").fill("E2E 自定义站点");
  await options.locator("#customDomain").fill("127.0.0.1");
  await options.locator("#customCourseSelector").fill("h1");
  await options.locator("#customChapterSelector").fill("#chapters li");
  await options.locator("#customChapterIdAttribute").fill("data-id");
  await options.locator("#customCurrentChapterSelector").fill("#chapters li");
  await options.locator("#customTranscriptSelector").fill(".subtitle");
  await options.getByRole("button", { name: "添加自定义站点" }).click();
  await expect(options.locator("#status")).toContainText("已添加自定义站点");
  await options.getByRole("button", { name: "保存配置" }).click();
  await expect(options.locator("#status")).toContainText("配置已保存");

  const page = await context.newPage();
  await page.goto(SITE);
  const overlay = page.locator("#learning-assistant-overlay");
  await expect(overlay).toBeVisible({ timeout: 20_000 });
  await expect(overlay).toContainText("适配器: E2E 自定义站点");
  await expect(overlay).toContainText("课程: E2E 假学习站点");
});

test("自定义站点可以编辑后保存", async ({ context, extensionId }) => {
  const options = await openOptions(context, extensionId);
  await options.locator("#customName").fill("E2E 编辑前");
  await options.locator("#customDomain").fill("127.0.0.1");
  await options.locator("#customCourseSelector").fill("h1");
  await options.locator("#customChapterSelector").fill("#chapters li");
  await options.getByRole("button", { name: "添加自定义站点" }).click();
  await options.getByRole("button", { name: "编辑" }).click();
  await options.locator("#customName").fill("E2E 编辑后");
  await options.getByRole("button", { name: "保存修改" }).click();
  await expect(options.locator("#status")).toContainText("已更新自定义站点");
  await options.getByRole("button", { name: "保存配置" }).click();
  await expect(options.locator("#status")).toContainText("配置已保存");

  const page = await context.newPage();
  await page.goto(SITE);
  const overlay = page.locator("#learning-assistant-overlay");
  await expect(overlay).toBeVisible({ timeout: 20_000 });
  await expect(overlay).toContainText("适配器: E2E 编辑后");
});

test("文章/文档页模式会在普通网页挂载浮层", async ({ context, extensionId }) => {
  const options = await openOptions(context, extensionId);
  await options.locator("#articleCapture").check();
  await options.getByRole("button", { name: "保存配置" }).click();
  await expect(options.locator("#status")).toContainText("配置已保存");

  const page = await context.newPage();
  await page.goto(ARTICLE);
  const overlay = page.locator("#learning-assistant-overlay");
  await expect(overlay).toBeVisible({ timeout: 20_000 });
  await expect(overlay).toContainText("适配器: 网页/文档");
  await expect(overlay).toContainText("课程: E2E 阅读资料");
});

test("暂停站点时不注入浮层", async ({ context, extensionId }) => {
  const options = await openOptions(context, extensionId);
  await options.locator("#pausedSites").fill("127.0.0.1");
  await options.getByRole("button", { name: "保存配置" }).click();
  await expect(options.locator("#status")).toContainText("配置已保存");

  const page = await context.newPage();
  await page.goto(SITE);
  await page.waitForTimeout(3000);
  await expect(page.locator("#learning-assistant-overlay")).toHaveCount(0);
});

test("隐私模式隐藏截图入口", async ({ context, extensionId }) => {
  const options = await openOptions(context, extensionId);
  await options.locator("#privacyMode").check();
  await options.getByRole("button", { name: "保存配置" }).click();
  await expect(options.locator("#status")).toContainText("配置已保存");

  const page = await context.newPage();
  await page.goto(SITE);
  const overlay = page.locator("#learning-assistant-overlay");
  await expect(overlay).toBeVisible({ timeout: 20_000 });
  await expect(overlay.getByRole("button", { name: "截图存证" })).toBeHidden();
});

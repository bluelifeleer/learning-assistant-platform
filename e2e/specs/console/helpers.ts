import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

/** 种子数据由 scripts/seed_e2e.py 写入 e2e/.tmp/seed.json */
export interface Seed {
  email: string;
  password: string;
  courses: { id: string; title: string; chapters: { id: string; title: string }[] }[];
}

export const seed: Seed = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "e2e", ".tmp", "seed.json"), "utf-8"),
) as Seed;

export const opsCourse = seed.courses[0];

export async function login(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("邮箱").fill(seed.email);
  await page.locator('input[autocomplete="current-password"]').fill(seed.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}

/** 通过左侧导航进入某个页面（文字即导航项名称）。 */
export async function openPage(page: Page, label: string): Promise<void> {
  const item = page.getByRole("navigation").getByRole("button", { name: label, exact: true });
  await item.click();
  // 导航按钮用 data-active 标记当前页；不同页面标题层级不一致，用导航态判断更稳
  await expect(item).toHaveAttribute("data-active", "yes");
}

/** 课程/章节选择器里选课程；章节列表是异步加载的，要等它出现再继续。 */
export async function pickCourse(page: Page, courseTitle: string): Promise<void> {
  await page.getByRole("combobox", { name: "课程" }).selectOption({ label: courseTitle });
  await expect(page.getByRole("combobox", { name: "章" }).locator("option")).not.toHaveCount(1);
}

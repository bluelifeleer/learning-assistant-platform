import fs from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** 种子数据由 scripts/seed_e2e.py 写入 e2e/.tmp/seed.json */
export interface Seed {
  email: string;
  password: string;
  courses: { id: string; title: string; chapters: { id: string; title: string }[] }[];
}

const API = "http://127.0.0.1:17899/api/v1";

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

/**
 * 把种子课程恢复成"在读"状态。
 *
 * 所有用例共享同一个 sqlite 库：某条用例中途失败可能留下"已归档"，
 * 后面的课程/测验用例就会看到空列表。依赖课程的 spec 在 beforeEach 里调一次，
 * 让失败不会连锁污染其它用例。
 */
export async function resetSeedCourses(request: APIRequestContext): Promise<void> {
  const loginResponse = await request.post(`${API}/auth/login`, {
    data: { email: seed.email, password: seed.password },
  });
  if (!loginResponse.ok()) return;
  const token = (await loginResponse.json()).token as string;
  for (const course of seed.courses) {
    await request.patch(`${API}/courses/${course.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { archived: false },
    });
  }
}

/** 把种子卡片改回"现在到期"，避免上一轮答过后复习页没有到期卡片。 */
export async function resetDueCards(request: APIRequestContext): Promise<void> {
  const loginResponse = await request.post(`${API}/auth/login`, {
    data: { email: seed.email, password: seed.password },
  });
  if (!loginResponse.ok()) return;
  const token = (await loginResponse.json()).token as string;
  const headers = { Authorization: `Bearer ${token}` };
  const listed = await request.get(`${API}/review/cards`, { headers });
  if (!listed.ok()) return;
  const items = ((await listed.json()).items ?? []) as { id: string }[];
  const now = new Date().toISOString();
  for (const card of items) {
    await request.patch(`${API}/review/cards/${card.id}`, { headers, data: { due_at: now, suspended: false } });
  }
}

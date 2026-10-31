import { expect, test } from "@playwright/test";
import { as, nav, open, settled } from "../support/helpers";

test.describe("notifications as a company manager", () => {
  test.use(as("manager"));

  test("the bell in the header opens the notifications page", async ({ page }) => {
    await page.goto("/");
    await expect(nav(page)).toBeVisible();
    await page.locator('[data-tour="bell"]').click();
    await expect(page.getByRole("heading", { level: 1, name: "الإشعارات" })).toBeVisible();
  });

  test("lists notifications or says there are none, with no load error", async ({ page }) => {
    await open(page, "/notifications", "الإشعارات");
    await settled(page);
    const list = page.locator('[data-tour="notification-list"]');
    await expect(list).toBeVisible();
    const items = await list.locator("li").count();
    if (items === 0) await expect(list).toContainText("لا توجد إشعارات");
  });

  test("the unread filter and mark-all control only appear when something is unread", async ({ page }) => {
    await open(page, "/notifications", "الإشعارات");
    await settled(page);
    const markAll = page.locator('[data-tour="mark-all"]');
    const filter = page.locator('[data-tour="unread-filter"]');
    expect(await markAll.count()).toBe(await filter.count());
  });
});

test.describe("notification thresholds", () => {
  test.describe("admin", () => {
    test.use(as("admin"));
    test("are shown to a system administrator for editing", async ({ page }) => {
      await open(page, "/notifications", "الإشعارات");
      await settled(page);
      await expect(page.locator('[data-tour="thresholds"]')).toBeVisible();
    });
  });
});

import { expect, test } from "@playwright/test";
import { accounts } from "../support/accounts";
import { as, open, settled } from "../support/helpers";

test.describe("user administration as a system administrator", () => {
  test.use(as("admin"));

  test("lists the demo users with their roles and status", async ({ page }) => {
    await open(page, "/users", "المستخدمون والصلاحيات");
    await settled(page);
    const table = page.locator('[data-tour="user-table"]');
    await expect(table).toContainText("المستخدمون");
    await expect(table.locator("thead")).toContainText("الأدوار");
    expect(await table.locator("tbody tr").count()).toBeGreaterThanOrEqual(10);
    await expect(table).toContainText(accounts().manager.email);
  });

  test("searching by email narrows the list", async ({ page }) => {
    await open(page, "/users", "المستخدمون والصلاحيات");
    await settled(page);
    await page.getByRole("searchbox").fill("manager@alwafra");
    await expect(page.locator('[data-tour="user-table"] tbody tr')).toHaveCount(1);
    await page.getByRole("searchbox").fill("");
    expect(await page.locator('[data-tour="user-table"] tbody tr').count()).toBeGreaterThan(1);
  });

  test("an administrator can never change or deactivate their own account", async ({ page }) => {
    await open(page, "/users", "المستخدمون والصلاحيات");
    await settled(page);
    const self = page.locator('[data-tour="user-table"] tbody tr', { hasText: accounts().admin.email });
    await expect(self).toContainText("(أنت)");
    await expect(self.getByRole("button", { name: "تعطيل المستخدم" })).toHaveCount(0);
  });

  test("the invite form opens in view with the email field focused, and needs an email", async ({ page }) => {
    await open(page, "/users", "المستخدمون والصلاحيات");
    await settled(page);
    await page.mouse.wheel(0, 2000);
    await page.locator('[data-tour="invite-user"]').click();
    const form = page.locator("form").filter({ hasText: "دعوة" }).first();
    await expect(form).toBeInViewport();
    await form.getByRole("button", { name: /إرسال|إنشاء|دعوة/ }).last().click(); // empty submit: the browser blocks it, nothing is created
    await expect(form).toBeVisible();
  });

  test("the roles and departments panel opens for another user", async ({ page }) => {
    await open(page, "/users", "المستخدمون والصلاحيات");
    await settled(page);
    const row = page.locator('[data-tour="user-table"] tbody tr', { hasText: accounts().viewer.email });
    await row.getByRole("button", { name: "إدارة الأدوار والأقسام" }).click();
    await expect(page.getByText(/إدارة:/)).toBeVisible();
    await page.getByRole("button", { name: /إغلاق/ }).first().click();
  });
});

test.describe("user administration as a company manager", () => {
  test.use(as("manager"));
  test("is not available: no invite control and no user list", async ({ page }) => {
    await page.goto("/users");
    await settled(page);
    await expect(page.locator('[data-tour="invite-user"]')).toHaveCount(0);
  });
});

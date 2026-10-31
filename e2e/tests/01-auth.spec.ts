import { expect, test } from "@playwright/test";
import { accounts, signOutProbe } from "../support/accounts";
import { anonymous, nav, alert, notice } from "../support/helpers";

test.describe("authentication", () => {
  test.use(anonymous);

  test("anonymous visitors only see the sign-in form, never data", async ({ page }) => {
    for (const path of ["/", "/licenses", "/companies", "/users"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "نظام الحوكمة والامتثال" })).toBeVisible();
      await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
      await expect(page.getByLabel("كلمة المرور")).toBeVisible();
      await expect(nav(page)).toHaveCount(0);
    }
  });

  test("a wrong password is rejected with a clear message and no session", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("البريد الإلكتروني").fill(accounts().admin.email);
    await page.getByLabel("كلمة المرور").fill("definitely-not-the-password-1");
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await expect(alert(page)).toContainText("تعذر تسجيل الدخول");
    await expect(nav(page)).toHaveCount(0);
  });

  test("forgot-password needs an email first, then answers neutrally", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "نسيت كلمة المرور؟" }).click();
    await expect(alert(page)).toContainText("أدخل بريدك الإلكتروني أولاً");
    await page.getByLabel("البريد الإلكتروني").fill("nobody-e2e@example.invalid");
    await page.getByRole("button", { name: "نسيت كلمة المرور؟" }).click();
    // The same message whether or not the address exists, so accounts cannot be probed.
    await expect(notice(page)).toContainText("إذا كان البريد مسجلاً");
  });

  test("signing in shows the user's name and role, and signing out returns to the form", async ({ page }) => {
    const probe = signOutProbe(); // not admin: sign-out revokes all of a user's sessions
    await page.goto("/");
    await page.getByLabel("البريد الإلكتروني").fill(probe.email);
    await page.getByLabel("كلمة المرور").fill(probe.password);
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await expect(nav(page)).toBeVisible();

    const menu = page.locator('[data-tour="user-menu"]');
    await expect(menu).toContainText("اطلاع فقط");
    await menu.click();
    await page.getByRole("menuitem", { name: "تسجيل الخروج" }).click();
    await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
    // After sign-out a protected URL must not bring the data back.
    await page.goto("/licenses");
    await expect(nav(page)).toHaveCount(0);
  });

  test("the set-password page rejects a link that carries no valid session", async ({ page }) => {
    await page.goto("/set-password");
    await expect(page.getByRole("heading", { name: "تعيين كلمة المرور" })).toBeVisible();
    await expect(page.getByText("الرابط غير صالح أو منتهي الصلاحية")).toBeVisible({ timeout: 15_000 });
  });
});

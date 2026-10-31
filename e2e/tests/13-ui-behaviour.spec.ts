import { expect, test } from "@playwright/test";
import { as, open, settled } from "../support/helpers";

test.describe("cross-cutting UI behaviour", () => {
  test.use(as("manager"));

  test("the document is right-to-left Arabic", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  });

  test("slow data shows skeleton placeholders first, then the real table", async ({ page }) => {
    await page.route("**/rest/v1/**", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
    await page.goto("/licenses");
    await expect(page.locator(".skeleton").first()).toBeVisible();
    await settled(page);
    await expect(page.locator('[data-tour="license-table"]')).toContainText("سجل التراخيص");
  });

  test("table cards share the dark title bar with an icon, subtitle and count", async ({ page }) => {
    await open(page, "/licenses", "إدارة التراخيص");
    await settled(page);
    const title = page.locator("header.table-title").first();
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS("background-image", /linear-gradient/);
    await expect(title.locator("svg").first()).toBeVisible();
    await expect(title).toContainText("سجل");
  });

  test("every search box leaves room between the icon and the text", async ({ page }) => {
    for (const path of ["/licenses", "/employees", "/users"]) {
      await page.goto(path);
      const box = page.getByRole("searchbox");
      if ((await box.count()) === 0) continue; // /users is admin-only for this role
      const padding = await box.evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
      expect(padding, `${path} search padding`).toBeGreaterThanOrEqual(40);
    }
  });

  test("the guided tour starts from the floating button and can be closed", async ({ page }) => {
    await open(page, "/licenses", "إدارة التراخيص");
    await settled(page);
    const launcher = page.locator("[data-tour-launcher]");
    await expect(launcher).toBeVisible();
    await launcher.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /إغلاق/ }).first().click();
    await expect(dialog).toHaveCount(0);
    await expect(launcher).toBeVisible();
  });
});

test.describe("narrow screens", () => {
  test.use({ ...as("manager"), viewport: { width: 390, height: 844 } });

  for (const [path, heading] of [["/", "لوحة الإدارة العامة"], ["/companies", "الشركات والأقسام"], ["/profile", "الملف الشخصي"]] as const) {
    test(`${path} does not scroll sideways on a phone`, async ({ page }) => {
      await open(page, path, heading);
      await settled(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

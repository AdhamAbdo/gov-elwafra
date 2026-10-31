import { expect, test } from "@playwright/test";
import { as, e2eName, open, settled, field, notice } from "../support/helpers";

test.describe("government platform follow-up as a compliance officer", () => {
  test.use(as("officer"));

  test("shows the manual-verification note, the platform matrix and the verification log", async ({ page }) => {
    await open(page, "/verifications", "متابعة المنصات الحكومية");
    await settled(page);
    await expect(page.locator('[data-tour="manual-note"]')).toContainText("تحقق يدوي");
    await expect(page.locator('[data-tour="platform-matrix"]')).toContainText("آخر تحقق لكل منصة");
    await expect(page.locator('[data-tour="verification-table"]')).toContainText("سجل التحقق");
    await expect(page.locator('[data-tour="verification-table"] thead')).toContainText("الموعد التشغيلي التالي");
  });

  test("filters by platform, company and result, and the open-follow-up counter is shown", async ({ page }) => {
    await open(page, "/verifications", "متابعة المنصات الحكومية");
    await settled(page);
    const filters = page.locator('[data-tour="filters"]');
    for (const label of ["المنصة", "الشركة", "النتيجة"]) await expect(field(filters, label)).toBeVisible();
    await expect(filters).toContainText("متابعات مفتوحة");
    await field(filters, "المنصة").selectOption({ index: 2 });
    await expect(page.getByText(/تعذر تحميل/)).toHaveCount(0);
    await field(filters, "المنصة").selectOption({ index: 0 });
  });

  test("recording a verification without its required fields shows inline errors and saves nothing", async ({ page }) => {
    await open(page, "/verifications", "متابعة المنصات الحكومية");
    await settled(page);
    await page.mouse.wheel(0, 2000);
    await page.locator('[data-tour="add-verification"]').click();
    const form = page.locator("form", { hasText: "تسجيل تحقق يدوي من منصة رسمية" });
    await expect(form).toBeInViewport();
    await form.getByRole("button", { name: "حفظ" }).click();
    await expect(form.locator('small[role="alert"]').first()).toBeVisible();
    await form.getByRole("button", { name: "إلغاء" }).click();
    await expect(form).toHaveCount(0);
  });

  test("@mutating a manual verification is recorded", async ({ page }) => {
    await open(page, "/verifications", "متابعة المنصات الحكومية");
    await settled(page);
    await page.locator('[data-tour="add-verification"]').click();
    const form = page.locator("form", { hasText: "تسجيل تحقق يدوي من منصة رسمية" });
    await field(form, "الشركة").selectOption({ index: 1 });
    await field(form, "الحالة كما تظهر في المنصة").fill(e2eName("حالة"));
    await form.getByRole("button", { name: "حفظ" }).click();
    await expect(notice(page)).toContainText("تم تسجيل التحقق اليدوي");
  });
});

test.describe("government platform follow-up as a read-only user", () => {
  test.use(as("viewer"));
  test("can read the log but not record verifications", async ({ page }) => {
    await open(page, "/verifications", "متابعة المنصات الحكومية");
    await settled(page);
    await expect(page.locator('[data-tour="verification-table"]')).toBeVisible();
    await expect(page.locator('[data-tour="add-verification"]')).toHaveCount(0);
  });
});

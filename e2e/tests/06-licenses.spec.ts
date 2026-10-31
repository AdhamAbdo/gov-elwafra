import { expect, test, type Page } from "@playwright/test";
import { as, e2eName, open, settled, alert, field, notice } from "../support/helpers";

const table = (page: Page) => page.locator('[data-tour="license-table"]');

test.describe("licenses as a company manager", () => {
  test.use(as("manager"));

  test("shows the license register with its title bar and columns", async ({ page }) => {
    await open(page, "/licenses", "إدارة التراخيص");
    await settled(page);
    await expect(table(page)).toContainText("سجل التراخيص");
    for (const col of ["الترخيص", "الانتهاء", "حالة الصلاحية", "التجديد"]) await expect(table(page).locator("thead")).toContainText(col);
  });

  test("searching narrows the register and clearing restores it", async ({ page }) => {
    await open(page, "/licenses", "إدارة التراخيص");
    await settled(page);
    const search = page.getByRole("searchbox");
    await search.fill("zzzz-no-such-license");
    await expect(table(page).locator("header")).toContainText("0 من");
    await search.fill("");
    await expect(table(page).locator("header")).not.toContainText(/^0 من/);
  });

  test("the add-license form opens in view, focuses its first field and can be cancelled", async ({ page }) => {
    await open(page, "/licenses", "إدارة التراخيص");
    await settled(page);
    await page.mouse.wheel(0, 2000);
    await page.locator('[data-tour="add-license"]').click();
    const form = page.locator("form", { hasText: "إضافة ترخيص" });
    await expect(form).toBeInViewport();
    await expect(field(form, "الشركة")).toBeFocused();
    await form.getByRole("button", { name: "إلغاء" }).click();
    await expect(form).toHaveCount(0);
  });

  test("an expiry date earlier than the issue date is refused before anything is saved", async ({ page }) => {
    await open(page, "/licenses", "إدارة التراخيص");
    await settled(page);
    await page.locator('[data-tour="add-license"]').click();
    const form = page.locator("form", { hasText: "إضافة ترخيص" });
    await field(form, "الشركة").selectOption({ index: 1 });
    await field(form, "نوع الترخيص").fill("E2E validation only");
    await field(form, "الجهة المصدرة").fill("E2E");
    await field(form, "رقم الترخيص").fill("E2E-INVALID");
    await field(form, "تاريخ الإصدار").fill("2030-06-01");
    await field(form, "تاريخ الانتهاء").fill("2030-01-01");
    await form.getByRole("button", { name: "حفظ" }).click();
    await expect(alert(page)).toContainText("تاريخ الانتهاء لا يمكن أن يسبق تاريخ الإصدار");
  });

  test("exports the visible register as a CSV file", async ({ page }) => {
    await open(page, "/licenses", "إدارة التراخيص");
    await settled(page);
    const download = page.waitForEvent("download", { timeout: 8_000 }).catch(() => null);
    await page.locator('[data-tour="export"]').getByRole("button").click();
    const file = await download;
    if (file) expect(file.suggestedFilename()).toMatch(/\.csv$/);
    else await expect(page.locator('[data-tour="export"]')).toContainText("لا توجد بيانات"); // empty register: nothing to export
  });

  test("a record's attachments dialog opens and closes", async ({ page }) => {
    await open(page, "/licenses", "إدارة التراخيص");
    await settled(page);
    const button = table(page).getByRole("button", { name: "المرفقات" }).first();
    test.skip((await button.count()) === 0, "No license to open attachments for.");
    await button.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("المرفقات");
    await expect(dialog.getByRole("button", { name: "إغلاق" })).toBeVisible();
    await dialog.getByRole("button", { name: "إغلاق" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("@mutating a license is created and found in the register", async ({ page }) => {
    const type = e2eName("ترخيص");
    const number = `E2E-${Date.now()}`;
    await open(page, "/licenses", "إدارة التراخيص");
    await settled(page);
    await page.locator('[data-tour="add-license"]').click();
    const form = page.locator("form", { hasText: "إضافة ترخيص" });
    await field(form, "الشركة").selectOption({ index: 1 });
    await field(form, "نوع الترخيص").fill(type);
    await field(form, "الجهة المصدرة").fill("E2E");
    await field(form, "رقم الترخيص").fill(number);
    await field(form, "تاريخ الانتهاء").fill("2031-01-01");
    await form.getByRole("button", { name: "حفظ" }).click();
    await expect(notice(page)).toContainText("تمت إضافة الترخيص");
    await page.getByRole("searchbox").fill(number);
    await expect(table(page)).toContainText(type);
  });
});

test.describe("licenses as a read-only user", () => {
  test.use(as("viewer"));
  test("can read the register but has no add or action controls", async ({ page }) => {
    await open(page, "/licenses", "إدارة التراخيص");
    await settled(page);
    await expect(table(page)).toContainText("سجل التراخيص");
    await expect(page.locator('[data-tour="add-license"]')).toHaveCount(0);
  });
});

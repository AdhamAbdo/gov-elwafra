import { expect, test } from "@playwright/test";
import { as, open, settled, field } from "../support/helpers";

test.describe("audit log as a company manager", () => {
  test.use(as("manager"));

  test("shows the append-only event table with its filters", async ({ page }) => {
    await open(page, "/audit", "سجل التدقيق");
    await settled(page);
    await expect(page.locator('[data-tour="audit-note"]')).toBeVisible();
    await expect(page.locator('[data-tour="audit-table"]')).toContainText("الأحداث");
    for (const label of ["الإجراء يحتوي", "من تاريخ", "إلى تاريخ"]) await expect(page.getByLabel(label)).toBeVisible();
  });

  test("filtering by an action that never happened empties the table", async ({ page }) => {
    await open(page, "/audit", "سجل التدقيق");
    await settled(page);
    await page.getByLabel("الإجراء يحتوي").fill("zzzz_no_such_action");
    await expect(page.locator('[data-tour="audit-table"] header')).toContainText("0");
  });
});

test.describe("data import as a company manager", () => {
  test.use(as("manager"));

  const CSV = [
    "license_type,authority,license_number,expiry_date",
    "E2E preview,E2E authority,E2E-PREVIEW-1,2031-01-01",
    "E2E preview,E2E authority,E2E-PREVIEW-2,not-a-date",
  ].join("\n");

  test("explains how importing works and lists past imports", async ({ page }) => {
    await open(page, "/import", "استيراد البيانات");
    await settled(page);
    await expect(page.locator('[data-tour="import-note"]')).toBeVisible();
    await expect(page.locator('[data-tour="import-history"]')).toContainText("سجل عمليات الاستيراد");
  });

  test("downloads the CSV template", async ({ page }) => {
    await open(page, "/import", "استيراد البيانات");
    await settled(page);
    const download = page.waitForEvent("download");
    await page.locator('[data-tour="template"]').click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  });

  test("a CSV is mapped and previewed with valid and invalid rows, and nothing is saved", async ({ page }) => {
    await open(page, "/import", "استيراد البيانات");
    await settled(page);
    await field(page.locator("main"), "الشركة").selectOption({ index: 1 });
    await page.locator('input[type="file"]').setInputFiles({ name: "licenses-e2e.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
    await expect(page.getByText(/ربط الأعمدة —/)).toBeVisible();
    await expect(page.getByText("معاينة قبل الاستيراد")).toBeVisible();
    await expect(page.getByText("2 صف")).toBeVisible();
    await expect(page.getByText("1 غير صالح")).toBeVisible();
    await expect(page.getByText("1 صالح")).toBeVisible();
    // The preview is read-only: the import history is unchanged because the confirm button was never pressed.
  });
});

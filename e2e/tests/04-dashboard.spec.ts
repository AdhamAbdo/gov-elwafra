import { expect, test, type Page } from "@playwright/test";
import { as, e2eName, open, settled, field } from "../support/helpers";

const FILTERS = ["الدورة", "من تاريخ", "إلى تاريخ", "الشركة", "القسم", "الفئة", "الجهة", "حالة الامتثال", "مسؤول المهمة"];

/** The overview only draws KPIs/charts when an inspection cycle exists for the selected week. */
async function needsCycle(page: Page) {
  await settled(page);
  const has = (await page.locator('[data-tour="kpis"]').count()) > 0;
  test.skip(!has, "No inspection cycle exists yet: run `npm run scheduler` to generate this week's tasks.");
}

test.describe("dashboard as admin", () => {
  test.use(as("admin"));

  test("shows ten KPI cards, the filter grid and both charts", async ({ page }) => {
    await open(page, "/", "لوحة الإدارة العامة");
    await needsCycle(page);
    await expect(page.locator('[data-tour="kpis"] > div')).toHaveCount(10);
    for (const label of ["نسبة إنجاز الفحص", "نسبة الامتثال المعتمد", "تتطلب إجراء", "مهام متأخرة", "إجراءات تصحيحية مفتوحة"])
      await expect(page.locator('[data-tour="kpis"]').getByText(label, { exact: true })).toBeVisible();
    await expect(page.locator('[data-tour="company-chart"]')).toContainText("مقارنة الشركات");
    await expect(page.locator('[data-tour="trend-chart"]')).toContainText("الاتجاه الأسبوعي");
  });

  test("offers all nine filters plus a reset button", async ({ page }) => {
    await open(page, "/", "لوحة الإدارة العامة");
    await needsCycle(page);
    const filters = page.locator('[data-tour="filters"]');
    for (const label of FILTERS) await expect(field(filters, label)).toBeVisible();
    await expect(filters.getByRole("button", { name: "إعادة ضبط المرشحات" })).toBeVisible();
  });

  test("the company filter lists every company, filters, and resets", async ({ page }) => {
    await open(page, "/", "لوحة الإدارة العامة");
    await needsCycle(page);
    const company = field(page.locator('[data-tour="filters"]'), "الشركة");
    expect(await company.locator("option").count()).toBeGreaterThanOrEqual(4); // "all" + the three demo companies
    await company.selectOption({ index: 1 });
    await expect(company).not.toHaveValue("");
    await expect(page.getByText(/تعذر تحميل/)).toHaveCount(0);
    await page.getByRole("button", { name: "إعادة ضبط المرشحات" }).click();
    await expect(company).toHaveValue("");
  });

  test("the work list shows the inspection and corrective-action tables", async ({ page }) => {
    await open(page, "/", "لوحة الإدارة العامة");
    await settled(page);
    await expect(page.locator('[data-tour="tasks-table"]')).toContainText("مهام التفتيش الحالية");
    await expect(page.locator('[data-tour="tasks-table"] thead')).toContainText("الالتزام");
    await expect(page.locator('[data-tour="actions-table"]')).toContainText("الإجراءات التصحيحية");
    await expect(page.locator('[data-tour="actions-table"] thead')).toContainText("الأولوية");
  });

  test("refresh reloads the data without an error", async ({ page }) => {
    await open(page, "/", "لوحة الإدارة العامة");
    await settled(page);
    await page.getByRole("button", { name: "تحديث" }).first().click();
    await settled(page);
    await expect(page.getByText(/تعذر تحميل/)).toHaveCount(0);
  });
});

test.describe("dashboard scope as a company manager", () => {
  test.use(as("manager"));

  test("only offers the manager's own company in the filter", async ({ page }) => {
    await open(page, "/", "لوحة الإدارة العامة");
    await needsCycle(page);
    const options = field(page.locator('[data-tour="filters"]'), "الشركة").locator("option");
    await expect(options).toHaveCount(2); // "all" + the single company this manager belongs to
  });
});

test.describe("dashboard data entry", () => {
  test.use(as("manager"));

  test("@mutating a manager adds an obligation and the form closes", async ({ page }) => {
    await open(page, "/", "لوحة الإدارة العامة");
    await settled(page);
    await page.locator('[data-tour="add-obligation"]').click();
    const form = page.locator("form", { hasText: "إضافة التزام" });
    await expect(form).toBeVisible();
    await field(form, "الشركة").selectOption({ index: 1 });
    await field(form, "اسم الالتزام").fill(e2eName("التزام"));
    await form.getByRole("button", { name: "حفظ" }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText(/تعذر/)).toHaveCount(0);
  });
});

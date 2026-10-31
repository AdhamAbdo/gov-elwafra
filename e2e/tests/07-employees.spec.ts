import { expect, test } from "@playwright/test";
import { as, e2eName, open, settled, field, notice } from "../support/helpers";

test.describe("employees and contracts as a company manager", () => {
  test.use(as("manager"));

  test("shows the employees, contracts and resignations tables", async ({ page }) => {
    await open(page, "/employees", "الموظفون والعقود والاستقالات");
    await settled(page);
    await expect(page.locator('[data-tour="employee-table"]')).toContainText("الموظفون");
    await expect(page.locator('[data-tour="contract-table"]')).toContainText("العقود");
    await expect(page.locator('[data-tour="event-table"]')).toContainText("الاستقالات وإنهاء الخدمة");
    await expect(page.locator('[data-tour="employee-table"] thead')).toContainText("حالة العمل");
  });

  test("searching for a name nobody has shows the empty state, and clearing restores the list", async ({ page }) => {
    await open(page, "/employees", "الموظفون والعقود والاستقالات");
    await settled(page);
    const search = page.getByRole("searchbox");
    await search.fill("zzzz-no-such-employee");
    await expect(page.locator('[data-tour="employee-table"] tbody')).toContainText("لا توجد");
    await search.fill("");
    await expect(page.locator('[data-tour="employee-table"] tbody tr').first()).toBeVisible();
  });

  test("the add-employee form opens in view with the company field focused", async ({ page }) => {
    await open(page, "/employees", "الموظفون والعقود والاستقالات");
    await settled(page);
    await page.mouse.wheel(0, 2000);
    await page.locator('[data-tour="add-employee"]').click();
    const form = page.locator("form", { hasText: "إضافة موظف" });
    await expect(form).toBeInViewport();
    await expect(field(form, "الشركة")).toBeFocused();
    for (const label of ["القسم", "الرمز الوظيفي الداخلي", "الاسم", "المسمى الوظيفي", "تاريخ المباشرة"]) await expect(field(form, label)).toBeVisible();
    await form.getByRole("button", { name: "إلغاء" }).click();
    await expect(form).toHaveCount(0);
  });

  test("the employee export button is offered", async ({ page }) => {
    await open(page, "/employees", "الموظفون والعقود والاستقالات");
    await settled(page);
    await expect(page.locator('[data-tour="export"]').first()).toBeVisible();
  });

  test("@mutating an employee is created and appears in the table", async ({ page }) => {
    const name = e2eName("موظف");
    const code = `E2E-${Date.now()}`;
    await open(page, "/employees", "الموظفون والعقود والاستقالات");
    await settled(page);
    await page.locator('[data-tour="add-employee"]').click();
    const form = page.locator("form", { hasText: "إضافة موظف" });
    await field(form, "الشركة").selectOption({ index: 1 });
    await field(form, "الرمز الوظيفي الداخلي").fill(code);
    await field(form, "الاسم").fill(name);
    await field(form, "المسمى الوظيفي").fill("E2E");
    await form.getByRole("button", { name: "تأكيد" }).click();
    await expect(notice(page)).toContainText("تمت إضافة الموظف");
    await page.getByRole("searchbox").fill(code);
    await expect(page.locator('[data-tour="employee-table"]')).toContainText(name);
  });
});

test.describe("employees as a read-only user", () => {
  test.use(as("viewer"));
  test("never gets the add or per-record action controls", async ({ page }) => {
    await open(page, "/employees", "الموظفون والعقود والاستقالات");
    await settled(page);
    await expect(page.locator('[data-tour="add-employee"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "تسجيل استقالة / إنهاء" })).toHaveCount(0);
  });
});

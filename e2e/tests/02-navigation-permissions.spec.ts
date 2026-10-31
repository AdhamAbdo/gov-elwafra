import { expect, test } from "@playwright/test";
import type { Role } from "../support/accounts";
import { as, nav, open } from "../support/helpers";

const BASE = ["لوحة المتابعة", "التراخيص", "الشركات والأقسام", "الموظفون والعقود", "المنصات الحكومية"];
const MANAGER_ONLY = ["سجل التدقيق", "استيراد البيانات"];
const ADMIN_ONLY = ["المستخدمون والصلاحيات"];

// The sidebar is a convenience; the database enforces the same rules. These cases check what each role is shown.
const EXPECTED: Record<Role, { shown: string[]; hidden: string[]; label: string }> = {
  admin: { shown: [...BASE, ...MANAGER_ONLY, ...ADMIN_ONLY], hidden: [], label: "مسؤول النظام" },
  manager: { shown: [...BASE, ...MANAGER_ONLY], hidden: ADMIN_ONLY, label: "مدير شركة" },
  officer: { shown: BASE, hidden: [...MANAGER_ONLY, ...ADMIN_ONLY], label: "مسؤول امتثال" },
  viewer: { shown: BASE, hidden: [...MANAGER_ONLY, ...ADMIN_ONLY], label: "اطلاع فقط" },
};

for (const role of Object.keys(EXPECTED) as Role[]) {
  test.describe(`sidebar and header as ${role}`, () => {
    test.use(as(role));

    test("shows exactly the sections this role may use", async ({ page }) => {
      await page.goto("/");
      const menu = nav(page);
      await expect(menu).toBeVisible();
      for (const label of EXPECTED[role].shown) await expect(menu.getByRole("link", { name: label })).toBeVisible();
      for (const label of EXPECTED[role].hidden) await expect(menu.getByRole("link", { name: label })).toHaveCount(0);
      await expect(page.locator('[data-tour="user-menu"]')).toContainText(EXPECTED[role].label);
    });

    test("every visible sidebar link opens its page without an error", async ({ page }) => {
      await page.goto("/");
      for (const label of EXPECTED[role].shown) {
        await nav(page).getByRole("link", { name: label }).click();
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await expect(nav(page).getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
        await expect(page.getByText(/تعذر تحميل/)).toHaveCount(0);
      }
    });
  });
}

test.describe("role-gated controls", () => {
  test.describe("viewer", () => {
    test.use(as("viewer"));
    test("has no create/edit controls on companies, licenses or verifications", async ({ page }) => {
      await open(page, "/companies", "الشركات والأقسام");
      await expect(page.locator('[data-tour="add-company"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: "تعديل" })).toHaveCount(0);
      await open(page, "/licenses", "إدارة التراخيص");
      await expect(page.locator('[data-tour="add-license"]')).toHaveCount(0);
      await open(page, "/verifications", "متابعة المنصات الحكومية");
      await expect(page.locator('[data-tour="add-verification"]')).toHaveCount(0);
    });
  });

  test.describe("manager", () => {
    test.use(as("manager"));
    test("can add departments but not companies, and cannot invite users", async ({ page }) => {
      await open(page, "/companies", "الشركات والأقسام");
      await expect(page.locator('[data-tour="add-company"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: "إضافة قسم" }).first()).toBeVisible();
      await page.goto("/users");
      await expect(page.locator('[data-tour="invite-user"]')).toHaveCount(0);
    });
  });

  test.describe("admin", () => {
    test.use(as("admin"));
    test("can add companies and invite users", async ({ page }) => {
      await open(page, "/companies", "الشركات والأقسام");
      await expect(page.locator('[data-tour="add-company"]')).toBeVisible();
      await open(page, "/users", "المستخدمون والصلاحيات");
      await expect(page.locator('[data-tour="invite-user"]')).toBeVisible();
    });
  });
});

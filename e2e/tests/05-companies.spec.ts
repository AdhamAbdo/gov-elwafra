import { expect, test } from "@playwright/test";
import { as, e2eName, open, PNG_1X1, settled, alert, field, notice } from "../support/helpers";

const cards = (page: import("@playwright/test").Page) => page.locator('[data-tour="company-card"]');

test.describe("companies and departments as admin", () => {
  test.use(as("admin"));

  test("lists the three demo companies with stat tiles and a departments section", async ({ page }) => {
    await open(page, "/companies", "الشركات والأقسام");
    await settled(page);
    await expect(cards(page)).toHaveCount(3);
    for (const name of ["الوفرة", "صوافي", "صيوان"]) await expect(page.locator("main")).toContainText(name);
    const first = cards(page).first();
    await expect(first.locator(".stat-tile")).toHaveCount(6);
    await expect(first.getByRole("heading", { name: "الأقسام" })).toBeVisible();
    await expect(first.getByRole("button", { name: "تعديل" }).first()).toBeVisible();
  });

  test("an admin can open the add-company form and cancel it", async ({ page }) => {
    await open(page, "/companies", "الشركات والأقسام");
    await page.locator('[data-tour="add-company"]').click();
    const form = page.locator("form", { hasText: "إضافة شركة" });
    await expect(form).toBeVisible();
    await expect(field(form, "اسم الشركة")).toBeFocused();
    await form.getByRole("button", { name: "إغلاق" }).click();
    await expect(form).toHaveCount(0);
  });

  test("adding a department opens the form in view with the cursor in the name field", async ({ page }) => {
    await open(page, "/companies", "الشركات والأقسام");
    await settled(page);
    await page.mouse.wheel(0, 2000); // the form opens at the top; the page must bring it back into view
    await cards(page).last().getByRole("button", { name: "إضافة قسم" }).click();
    const form = page.locator("form", { hasText: "إضافة قسم" });
    await expect(form).toBeInViewport();
    await expect(field(form, "اسم القسم")).toBeFocused();
  });

  test("deactivating a department warns that its obligations will be deactivated too", async ({ page }) => {
    await open(page, "/companies", "الشركات والأقسام");
    await settled(page);
    const row = page.locator(".branch-row").filter({ has: page.getByRole("button", { name: "تعطيل" }) }).first();
    test.skip((await row.count()) === 0, "No active department to open the deactivation form on.");
    await row.getByRole("button", { name: "تعطيل" }).click();
    await expect(page.getByText("سيتم أيضاً تعطيل الالتزامات النشطة")).toBeVisible();
    await page.getByRole("button", { name: "إغلاق" }).click(); // closed without confirming: nothing is written
  });

  test("a company logo must be a real image of at most 2 MB", async ({ page }) => {
    await open(page, "/companies", "الشركات والأقسام");
    await settled(page);
    const pick = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: /تغيير شعار/ }).first().click();
      await (await chooser).setFiles(file);
    };
    await pick({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("this is not an image") });
    await expect(alert(page)).toContainText("PNG أو JPG أو WebP");
    await pick({ name: "huge.png", mimeType: "image/png", buffer: Buffer.concat([PNG_1X1, Buffer.alloc(2 * 1024 * 1024 + 10)]) });
    await expect(alert(page)).toContainText("2 ميغابايت");
  });
});

test.describe("companies as a company manager", () => {
  test.use(as("manager"));

  test("sees only their own company and can add departments to it", async ({ page }) => {
    await open(page, "/companies", "الشركات والأقسام");
    await settled(page);
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("الوفرة");
    await expect(cards(page).first().getByRole("button", { name: "إضافة قسم" })).toBeVisible();
    await expect(page.getByRole("button", { name: /تغيير شعار/ })).toHaveCount(0); // logos are the system administrator's
  });

  test("@mutating a department is created, rejected as a duplicate, renamed and deactivated", async ({ page }) => {
    const name = e2eName("قسم");
    const renamed = `${name} (معدّل)`;
    await open(page, "/companies", "الشركات والأقسام");
    await settled(page);
    const card = cards(page).first();

    await card.getByRole("button", { name: "إضافة قسم" }).click();
    let form = page.locator("form", { hasText: "إضافة قسم" });
    await field(form, "اسم القسم").fill(name);
    await form.getByRole("button", { name: "حفظ" }).click();
    await expect(notice(page)).toContainText("تمت إضافة القسم");
    const row = () => page.locator(".branch-row", { hasText: name });
    await expect(row()).toBeVisible();

    // The same name twice in one company is refused by the database.
    await card.getByRole("button", { name: "إضافة قسم" }).click();
    form = page.locator("form", { hasText: "إضافة قسم" });
    await field(form, "اسم القسم").fill(name);
    await form.getByRole("button", { name: "حفظ" }).click();
    await expect(alert(page)).toContainText("تعذر إضافة القسم");
    await form.getByRole("button", { name: "إغلاق" }).click();

    await row().getByRole("button", { name: "تعديل" }).click();
    form = page.locator("form", { hasText: "تعديل القسم" });
    await field(form, "اسم القسم").fill(renamed);
    await form.getByRole("button", { name: "حفظ" }).click();
    await expect(notice(page)).toContainText("تم تعديل القسم");
    await expect(page.locator(".branch-row", { hasText: renamed })).toBeVisible();

    // Regression: deactivation once failed with 'column reference "branch_id" is ambiguous'.
    await page.locator(".branch-row", { hasText: renamed }).getByRole("button", { name: "تعطيل" }).click();
    form = page.locator("form", { hasText: "تعطيل" }).last();
    await field(form, "سبب التعطيل (مطلوب)").fill("E2E cleanup");
    await form.getByRole("button", { name: "تأكيد التعطيل" }).click();
    await expect(notice(page)).toContainText("تم تعطيل القسم");
    await expect(page.locator(".branch-row", { hasText: renamed })).toContainText("غير نشط");
  });
});

test.describe("companies as a read-only user", () => {
  test.use(as("viewer"));
  test("can see the company but not change it", async ({ page }) => {
    await open(page, "/companies", "الشركات والأقسام");
    await settled(page);
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: /تعديل|تعطيل|إضافة قسم/ })).toHaveCount(0);
  });
});

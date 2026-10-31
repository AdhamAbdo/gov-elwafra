import { expect, test } from "@playwright/test";
import { accounts } from "../support/accounts";
import { as, open, PNG_1X1, settled, alert, field, notice } from "../support/helpers";

test.describe("profile page", () => {
  test.use(as("viewer"));

  test("the user menu leads to a profile showing name, email and roles", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-tour="user-menu"]').click();
    await page.getByRole("menuitem", { name: "الملف الشخصي" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "الملف الشخصي" })).toBeVisible();
    await settled(page);
    await expect(page.getByLabel("البريد الإلكتروني")).toHaveValue(accounts().viewer.email);
    await expect(page.getByLabel("البريد الإلكتروني")).toBeDisabled();
    await expect(page.locator("main")).toContainText("اطلاع فقط");
  });

  test("the save button stays disabled until the name actually changes", async ({ page }) => {
    await open(page, "/profile", "الملف الشخصي");
    await settled(page);
    const save = page.getByRole("button", { name: "حفظ التغييرات" });
    await expect(save).toBeDisabled();
    const name = page.getByLabel("الاسم المعروض");
    const original = await name.inputValue();
    await name.fill(`${original} x`);
    await expect(save).toBeEnabled();
    await name.fill(original);
    await expect(save).toBeDisabled();
  });

  test("password change enforces the policy and checks the current password", async ({ page }) => {
    await open(page, "/profile", "الملف الشخصي");
    await settled(page);
    const form = page.locator("form", { hasText: "تغيير كلمة المرور" });
    const submit = form.getByRole("button", { name: "تغيير كلمة المرور" });

    await submit.click(); // an empty form is refused with a message (the form opts out of browser validation)
    await expect(form.getByRole("alert")).toContainText("أدخل كلمة المرور الحالية");

    await field(form, "كلمة المرور الحالية").fill("whatever-current-1");
    await field(form, "كلمة المرور الجديدة").fill("short1");
    await field(form, "تأكيد كلمة المرور الجديدة").fill("short1");
    await submit.click();
    await expect(form.getByRole("alert")).toContainText("10 أحرف");

    await field(form, "كلمة المرور الجديدة").fill("longenough123");
    await field(form, "تأكيد كلمة المرور الجديدة").fill("different12345");
    await submit.click();
    await expect(form.getByRole("alert")).toContainText("غير مطابق");

    await field(form, "تأكيد كلمة المرور الجديدة").fill("longenough123");
    await submit.click(); // valid new password, but the current one is wrong: refused, nothing changes
    await expect(form.getByRole("alert")).toContainText("كلمة المرور الحالية غير صحيحة");
  });

  test("a profile picture must be a real image of at most 2 MB", async ({ page }) => {
    await open(page, "/profile", "الملف الشخصي");
    await settled(page);
    const pick = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "تغيير الصورة" }).click();
      await (await chooser).setFiles(file);
    };
    await pick({ name: "me.png", mimeType: "image/png", buffer: Buffer.from("not an image at all") });
    await expect(alert(page)).toContainText("PNG أو JPG أو WebP");
    await pick({ name: "big.png", mimeType: "image/png", buffer: Buffer.concat([PNG_1X1, Buffer.alloc(2 * 1024 * 1024 + 10)]) });
    await expect(alert(page)).toContainText("2 ميغابايت");
  });

  test("@mutating the display name is changed, shown in the header, and restored", async ({ page }) => {
    await open(page, "/profile", "الملف الشخصي");
    await settled(page);
    const field = page.getByLabel("الاسم المعروض");
    const original = await field.inputValue();
    const temporary = `${original} E2E`;
    const header = page.locator('[data-tour="user-menu"]');

    await field.fill(temporary);
    await page.getByRole("button", { name: "حفظ التغييرات" }).click();
    await expect(notice(page)).toContainText("تم حفظ الاسم");
    await expect(header).toContainText(temporary);

    await field.fill(original);
    await page.getByRole("button", { name: "حفظ التغييرات" }).click();
    await expect(notice(page)).toContainText("تم حفظ الاسم");
    await expect(header).not.toContainText("E2E");
  });

  test("@mutating a profile picture is uploaded, shown, and removed", async ({ page }) => {
    await open(page, "/profile", "الملف الشخصي");
    await settled(page);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "تغيير الصورة" }).click();
    await (await chooser).setFiles({ name: "avatar.png", mimeType: "image/png", buffer: PNG_1X1 });
    await expect(page.getByRole("img", { name: "الصورة الشخصية" })).toBeVisible();
    await page.getByRole("button", { name: "حذف الصورة" }).click();
    await expect(page.getByRole("img", { name: "الصورة الشخصية" })).toHaveCount(0);
  });
});

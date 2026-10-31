import { mkdirSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { accounts, authFile, ROLES } from "./support/accounts";

// Signs in once per role and stores the Supabase session, so the specs start already authenticated.
const all = accounts();
mkdirSync("e2e/.auth", { recursive: true });

for (const role of ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("البريد الإلكتروني").fill(all[role].email);
    await page.getByLabel("كلمة المرور").fill(all[role].password);
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "التنقل الرئيسي" })).toBeVisible();
    await page.context().storageState({ path: authFile(role) });
  });
}

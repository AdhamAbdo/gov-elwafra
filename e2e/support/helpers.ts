import { expect, type Locator, type Page } from "@playwright/test";
import { authFile, type Role } from "./accounts";

/** `test.use(as("manager"))` starts the spec already signed in as that demo role. */
export const as = (role: Role) => ({ storageState: authFile(role) });
export const anonymous = { storageState: { cookies: [], origins: [] } };

export const nav = (page: Page) => page.getByRole("navigation", { name: "التنقل الرئيسي" });

/** Opens a page and waits for its heading, failing fast if the page reported a data-loading error. */
export async function open(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByText(/تعذر تحميل/)).toHaveCount(0);
}

/** Waits until the page's skeleton/spinner placeholders are gone, i.e. the data request finished. */
export async function settled(page: Page) {
  await expect(page.locator(".skeleton, .spinner")).toHaveCount(0, { timeout: 20_000 });
}

/** A unique, recognisable name so test records can be found (and ignored) later. */
export const e2eName = (label: string) => `[E2E] ${label} ${Date.now().toString(36)}`;

/** Smallest valid PNG (1x1), for upload tests. */
export const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==", "base64");

export async function expectFocused(locator: Locator) {
  await expect(locator).toBeFocused();
}

/** App error/validation messages. Excludes Next.js's hidden route announcer, which also has role="alert". */
export const alert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The input/select/textarea of a labelled form field, matched on the label's OWN text.
 * getByLabel is unsuitable for selects: a wrapping <label> also contains the select's option text, so
 * "الشركة" would also match the "القسم" select ("... على مستوى الشركة").
 */
export const field = (scope: Locator, label: string) =>
  scope
    .locator("label")
    .filter({ has: scope.page().locator("span.font-medium", { hasText: new RegExp(`^${escapeRegExp(label)}$`) }) })
    .locator("input, select, textarea")
    .first();

/** App success messages. Excludes the visually hidden role="status" that the loading placeholders carry. */
export const notice = (page: Page) => page.locator('p[role="status"]');

import { expect, test } from "@playwright/test";
import { as } from "../support/helpers";

// The route handlers sit in front of the service-role key, so each one must refuse a caller with no valid session.
test.describe("API without a session", () => {
  test("health endpoint answers", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    expect((await res.json()).status).toBe("ok");
  });

  const protectedCalls: { method: "get" | "post" | "delete"; path: string }[] = [
    { method: "get", path: "/api/profile/avatar" },
    { method: "post", path: "/api/profile/avatar" },
    { method: "delete", path: "/api/profile/avatar" },
    { method: "get", path: "/api/companies/logo" },
    { method: "post", path: "/api/companies/logo" },
    { method: "delete", path: "/api/companies/logo" },
    { method: "post", path: "/api/attachments/url" },
    { method: "post", path: "/api/attachments/upload" },
    { method: "get", path: "/api/admin/users/list" },
    { method: "post", path: "/api/admin/users/create" },
    { method: "post", path: "/api/admin/users/active" },
  ];
  for (const { method, path } of protectedCalls) {
    test(`${method.toUpperCase()} ${path} is refused`, async ({ request }) => {
      const res = await request[method](path);
      expect([401, 403, 405]).toContain(res.status());
    });
  }

  test("a forged bearer token is refused", async ({ request }) => {
    const res = await request.get("/api/profile/avatar", { headers: { Authorization: "Bearer not-a-real-token" } });
    expect(res.status()).toBe(401);
  });
});

test.describe("API authorization by role", () => {
  test.describe("manager", () => {
    test.use(as("manager"));
    test("cannot use the administrator-only user endpoints", async ({ page }) => {
      await page.goto("/");
      const token = await page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
        return key ? (JSON.parse(localStorage.getItem(key) ?? "{}").access_token as string | undefined) : undefined;
      });
      expect(token).toBeTruthy();
      const res = await page.request.get("/api/admin/users/list", { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
    });

    test("cannot change a company logo it does not administer", async ({ page }) => {
      await page.goto("/");
      const token = await page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
        return key ? (JSON.parse(localStorage.getItem(key) ?? "{}").access_token as string | undefined) : undefined;
      });
      const res = await page.request.post("/api/companies/logo", { headers: { Authorization: `Bearer ${token}` }, multipart: { companyId: "00000000-0000-4000-8000-000000000000", file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("x") } } });
      expect([403, 422]).toContain(res.status());
    });
  });
});

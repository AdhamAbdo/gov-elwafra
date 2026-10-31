import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the REAL app and the Supabase project in .env.local, signed in as the demo accounts
// in docs/demo-accounts.txt. Read-only journeys always run. Journeys that WRITE data are tagged @mutating and only run
// with E2E_MUTATE=1 (npm run e2e:full), because they leave small, clearly named "[E2E]" records behind.
const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export const AUTH_DIR = "e2e/.auth";

export default defineConfig({
  testDir: "e2e",
  // One worker: every test shares one database, and mutating journeys must not interleave.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  grepInvert: process.env.E2E_MUTATE === "1" ? undefined : /@mutating/,
  use: {
    baseURL,
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"], testIgnore: /global\.setup\.ts/ },
  ],
  // Reuses a dev server that is already running (the usual case); otherwise starts one.
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000, env: { PORT: String(PORT) } },
});

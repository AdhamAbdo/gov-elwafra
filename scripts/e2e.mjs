// Cross-platform launcher for the Playwright suite (inline VAR=value does not work in cmd/PowerShell).
//   npm run e2e                  read-only journeys only (safe to repeat)
//   npm run e2e:full             also runs @mutating journeys, which write small "[E2E] ..." records
//   npm run e2e -- --headed      any extra arguments go to `playwright test`
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const mutate = args.includes("--mutate");
const passthrough = args.filter((a) => a !== "--mutate");

// Run Playwright's CLI with node directly (no shell), so arguments containing spaces or `|` reach it intact on Windows.
const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
const child = spawn(process.execPath, [cli, "test", ...passthrough], {
  stdio: "inherit",
  env: { ...process.env, ...(mutate ? { E2E_MUTATE: "1" } : {}) },
});
child.on("exit", (code) => process.exit(code ?? 1));

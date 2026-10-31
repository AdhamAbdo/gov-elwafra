// Weekly scheduler entry point. Safe to run repeatedly: the cycle row, the task generation
// (unique compliance_item_id + review_cycle_id) and the overdue marker are all idempotent.
// Usage: node scripts/run-scheduler.mjs [--at 2026-10-25T00:00:00+03:00]
// Node >= 22.18 strips types, so the TypeScript date utilities are shared with the app.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { weeklyCycleDates } from "../src/lib/dates.ts";

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error(".env.local must define NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const atIndex = process.argv.indexOf("--at");
const at = atIndex > -1 ? new Date(process.argv[atIndex + 1]) : new Date();
if (Number.isNaN(at.getTime())) throw new Error("--at must be a valid ISO date-time.");
const { startsOn, endsOn } = weeklyCycleDates(at);
const key = `weekly-cycle:${startsOn}`;

const must = (label, { data, error }) => { if (error) throw new Error(`${label}: ${error.message}`); return data; };

const run = must("record scheduler run", await db.from("scheduler_runs")
  .upsert({ job_name: "weekly-cycle", idempotency_key: key, status: "running", details: null, started_at: new Date().toISOString(), completed_at: null }, { onConflict: "idempotency_key" })
  .select("id").single());

try {
  await db.from("review_cycles").upsert({ starts_on: startsOn, ends_on: endsOn, timezone: "Asia/Riyadh" }, { onConflict: "starts_on,ends_on", ignoreDuplicates: true });
  const cycle = must("load review cycle", await db.from("review_cycles").select("id").eq("starts_on", startsOn).eq("ends_on", endsOn).single());
  const created = must("generate tasks", await db.rpc("generate_weekly_tasks", { cycle_id: cycle.id }));
  const overdue = must("mark overdue actions", await db.rpc("mark_overdue_corrective_actions"));
  const details = `cycle ${startsOn}..${endsOn}: ${created} task(s) created, ${overdue} action(s) marked overdue`;
  must("complete run", await db.from("scheduler_runs").update({ status: "completed", details, completed_at: new Date().toISOString() }).eq("id", run.id).select("id"));
  console.log(details);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await db.from("scheduler_runs").update({ status: "failed", details: message, completed_at: new Date().toISOString() }).eq("id", run.id);
  console.error(`Scheduler failed: ${message}`);
  process.exitCode = 1;
}

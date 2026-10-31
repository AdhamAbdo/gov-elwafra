// Generates deadline/event notifications (idempotent) and dispatches pending emails.
// Usage: npm run notify
// Email is optional: without RESEND_API_KEY and EMAIL_FROM, in-app notifications still work and emails are
// recorded as "skipped_unconfigured" (retried automatically once configured). "accepted_by_provider" is NOT proof of delivery.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createEmailProvider } from "../src/lib/email.ts";
import { buildEmail, shouldAttemptEmail } from "../src/lib/notifications.ts";

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error(".env.local must define NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const provider = createEmailProvider(env);
const appUrl = env.APP_URL || "http://localhost:3000";
const must = (label, { data, error }) => { if (error) throw new Error(`${label}: ${error.message}`); return data; };

const hour = new Date().toISOString().slice(0, 13);
const run = must("record run", await db.from("scheduler_runs").upsert({ job_name: "notifications", idempotency_key: `notifications:${hour}`, status: "running", details: null, started_at: new Date().toISOString(), completed_at: null }, { onConflict: "idempotency_key" }).select("id").single());

try {
  const created = must("generate notifications", await db.rpc("generate_deadline_notifications"));
  const queue = must("load email queue", await db.from("notifications").select("id,recipient_id,title,email_status,email_attempts,email_last_attempt_at").in("email_status", ["pending", "failed", "skipped_unconfigured"]).limit(200));
  const stats = { accepted: 0, failed: 0, skipped: 0, notDue: 0 };
  for (const n of queue) {
    if (!shouldAttemptEmail({ status: n.email_status, attempts: n.email_attempts, lastAttemptAt: n.email_last_attempt_at }, new Date())) { stats.notDue++; continue; }
    if (!provider) { must("mark skipped", await db.from("notifications").update({ email_status: "skipped_unconfigured" }).eq("id", n.id).select("id")); stats.skipped++; continue; }
    const { data: user, error: userError } = await db.auth.admin.getUserById(n.recipient_id);
    const to = user?.user?.email;
    let result;
    if (userError || !to) result = { outcome: "rejected", response: userError?.message ?? "recipient has no email address" };
    else { const mail = buildEmail({ title: n.title }, appUrl); result = await provider.send({ to, subject: mail.subject, text: mail.text }); }
    const accepted = result.outcome === "accepted";
    must("record attempt", await db.from("notification_delivery_attempts").insert({ notification_id: n.id, status: accepted ? "accepted_by_provider" : "failed", provider_response: result.response.slice(0, 500) }).select("id"));
    must("update notification", await db.from("notifications").update({ email_status: accepted ? "accepted_by_provider" : "failed", email_attempts: n.email_attempts + 1, email_last_attempt_at: new Date().toISOString(), email_provider_id: result.providerId ?? null }).eq("id", n.id).select("id"));
    if (accepted) stats.accepted++; else stats.failed++;
  }
  const details = `${created} notification(s) created; email: ${stats.accepted} accepted by provider, ${stats.failed} failed, ${stats.skipped} skipped (provider ${provider ? "configured" : "NOT configured"}), ${stats.notDue} not yet due`;
  must("complete run", await db.from("scheduler_runs").update({ status: "completed", details, completed_at: new Date().toISOString() }).eq("id", run.id).select("id"));
  console.log(details);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await db.from("scheduler_runs").update({ status: "failed", details: message, completed_at: new Date().toISOString() }).eq("id", run.id);
  await db.from("audit_logs").insert({ action: "notification_job_failed", entity_type: "scheduler_run", entity_id: run.id, after_value: { message } });
  console.error(`Notification job failed: ${message}`);
  process.exitCode = 1;
}

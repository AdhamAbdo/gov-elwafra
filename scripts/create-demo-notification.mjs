// Creates one clearly labelled [DEMO] in-app notification per demo account so the notifications UI can be previewed.
// Idempotent: the unique idempotency key means re-running never adds duplicates.
// Usage: node scripts/create-demo-notification.mjs [email ...]   (defaults to the demo admin and Bakery manager)
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const emails = process.argv.slice(2).length ? process.argv.slice(2) : ["admin@governance.local", "manager@alwafra.local"];

const { data: list, error: listError } = await db.auth.admin.listUsers({ perPage: 200 });
if (listError) throw new Error(`list users: ${listError.message}`);

for (const email of emails) {
  const user = list.users.find((u) => u.email === email);
  if (!user) { console.error(`skip ${email}: no such auth user`); continue; }
  const { data: role } = await db.from("user_company_roles").select("company_id").eq("user_id", user.id).limit(1).maybeSingle();
  const { data, error } = await db.from("notifications").upsert({
    recipient_id: user.id, event_type: "license_expiry", idempotency_key: `demo-notification:${user.id}`, scheduled_at: new Date().toISOString(),
    title: "[DEMO] ترخيص يقترب من الانتهاء", body: "[DEMO] رخصة بلدية — تاريخ الانتهاء بعد 30 يوماً. هذا إشعار تجريبي لمعاينة الشكل النهائي.",
    entity_type: "license", company_id: role?.company_id ?? null, in_app: true, email_status: "not_requested",
  }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(`${email}: ${error.message}`);
  console.log(`${email}: ${data.length ? "created" : "already exists"}`);
}

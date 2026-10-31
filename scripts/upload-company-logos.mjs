// One-off: uploads the logos in ./companies to the matching demo companies (after migration 202610230018 is applied).
// Uses the service role, so it requires --confirm-logo-upload. Companies that already have a logo are skipped unless --force.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectEnv = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }),
);
const url = projectEnv.NEXT_PUBLIC_SUPABASE_URL; const serviceRoleKey = projectEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error(".env.local must define NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
if (!process.argv.includes("--confirm-logo-upload")) throw new Error("Refusing to write to the database without --confirm-logo-upload.");
const force = process.argv.includes("--force");

const LOGOS = [
  { file: "companies/Al Wafra Bakery.png", company: "[DEMO] الوفرة للمخبوزات" },
  { file: "companies/Sawafi Paper Products.jpg", company: "[DEMO] صوافي للمنتجات الورقية" },
  { file: "companies/Siwan Chocolate.png", company: "[DEMO] صيوان للشوكولاتة" },
];
const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

for (const { file, company } of LOGOS) {
  const row = await admin.from("companies").select("id,logo_path").eq("name_ar", company).maybeSingle();
  if (row.error) throw new Error(`${company}: ${row.error.message}`);
  if (!row.data) { console.warn(`skip  ${company}: no such company`); continue; }
  if (row.data.logo_path && !force) { console.log(`skip  ${company}: already has a logo (use --force to replace)`); continue; }

  const bytes = await readFile(file);
  const ext = file.endsWith(".png") ? "png" : file.endsWith(".webp") ? "webp" : "jpg";
  const path = `${row.data.id}/${randomUUID()}.${ext}`;
  const stored = await admin.storage.from("company-logos").upload(path, bytes, { contentType: TYPES[ext], upsert: false });
  if (stored.error) throw new Error(`${company}: ${stored.error.message}`);
  const updated = await admin.from("companies").update({ logo_path: path }).eq("id", row.data.id);
  if (updated.error) { await admin.storage.from("company-logos").remove([path]); throw new Error(`${company}: ${updated.error.message}`); }
  if (row.data.logo_path) await admin.storage.from("company-logos").remove([row.data.logo_path]);
  console.log(`done  ${company} <- ${file}`);
}

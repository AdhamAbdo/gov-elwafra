import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser, respond } from "@/lib/server-auth";
import { MAX_AVATAR_BYTES, validateAvatar } from "@/lib/avatar-validation"; // logos share the profile-picture rules: PNG/JPG/WebP, 2 MB, real bytes

const BUCKET = "company-logos";
const idSchema = z.string().uuid();

/** Signed links for every company the caller can see (row-level security decides which), keyed by company id. */
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const rows = await ctx.userClient.from("companies").select("id,logo_path").not("logo_path", "is", null);
  if (rows.error) return respond(500, { error: rows.error.message });
  const paths = (rows.data ?? []).map((r) => r.logo_path as string);
  if (paths.length === 0) return respond(200, { logos: {} });
  const signed = await ctx.service.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (signed.error) return respond(500, { error: signed.error.message });
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  const logos: Record<string, string> = {};
  for (const r of rows.data ?? []) { const url = urlByPath.get(r.logo_path as string); if (url) logos[r.id as string] = url; }
  return respond(200, { logos });
}

// Order matters: authorize -> validate the real bytes -> store -> register the path (database) -> delete the previous file / undo on failure.
export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_AVATAR_BYTES + 64 * 1024) return respond(413, { error: "حجم الصورة يتجاوز 2 ميغابايت." });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file"); const companyId = idSchema.safeParse(form?.get("companyId"));
  if (!(file instanceof File) || !companyId.success) return respond(400, { error: "طلب غير صالح." });

  const allowed = await ctx.userClient.rpc("is_admin_of", { target_company: companyId.data });
  if (allowed.error || allowed.data !== true) return respond(403, { error: "غير مصرح بتعديل شعار هذه الشركة." });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateAvatar(bytes);
  if (!checked.ok) return respond(422, { error: checked.error });

  const path = `${companyId.data}/${randomUUID()}.${checked.extension}`;
  const stored = await ctx.service.storage.from(BUCKET).upload(path, bytes, { contentType: checked.mime, upsert: false });
  if (stored.error) return respond(500, { error: `تعذر حفظ الشعار: ${stored.error.message}` });

  const registered = await ctx.userClient.rpc("set_company_logo", { target_company: companyId.data, new_path: path });
  if (registered.error) {
    await ctx.service.storage.from(BUCKET).remove([path]);
    return respond(403, { error: registered.error.message });
  }
  if (typeof registered.data === "string") await ctx.service.storage.from(BUCKET).remove([registered.data]);
  return respond(200, { ok: true });
}

export async function DELETE(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const parsed = z.object({ companyId: idSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respond(400, { error: "طلب غير صالح." });
  const cleared = await ctx.userClient.rpc("set_company_logo", { target_company: parsed.data.companyId, new_path: null });
  if (cleared.error) return respond(403, { error: cleared.error.message });
  if (typeof cleared.data === "string") await ctx.service.storage.from(BUCKET).remove([cleared.data]);
  return respond(200, { ok: true });
}

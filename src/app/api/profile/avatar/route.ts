import { randomUUID } from "node:crypto";
import { requireUser, respond } from "@/lib/server-auth";
import { MAX_AVATAR_BYTES, validateAvatar } from "@/lib/avatar-validation";

const BUCKET = "avatars";

/** Current user's picture as a short-lived signed link (the bucket is private), or null when none is set. */
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const own = await ctx.userClient.from("user_profiles").select("avatar_path").eq("id", ctx.userId).maybeSingle();
  if (own.error) return respond(500, { error: own.error.message });
  const path = own.data?.avatar_path as string | null | undefined;
  if (!path) return respond(200, { url: null });
  const signed = await ctx.service.storage.from(BUCKET).createSignedUrl(path, 3600);
  return respond(200, { url: signed.data?.signedUrl ?? null });
}

// Order matters: validate the real bytes -> store -> register the path (database) -> delete the previous file / undo on failure.
export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_AVATAR_BYTES + 64 * 1024) return respond(413, { error: "حجم الصورة يتجاوز 2 ميغابايت." });
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return respond(400, { error: "طلب غير صالح." });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateAvatar(bytes);
  if (!checked.ok) return respond(422, { error: checked.error });

  // The path holds only ids and the validated extension, never the user-supplied name.
  const path = `${ctx.userId}/${randomUUID()}.${checked.extension}`;
  const stored = await ctx.service.storage.from(BUCKET).upload(path, bytes, { contentType: checked.mime, upsert: false });
  if (stored.error) return respond(500, { error: `تعذر حفظ الصورة: ${stored.error.message}` });

  const registered = await ctx.userClient.rpc("set_own_avatar", { new_path: path });
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
  const cleared = await ctx.userClient.rpc("set_own_avatar", { new_path: null });
  if (cleared.error) return respond(403, { error: cleared.error.message });
  if (typeof cleared.data === "string") await ctx.service.storage.from(BUCKET).remove([cleared.data]);
  return respond(200, { ok: true });
}

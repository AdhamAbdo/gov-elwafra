import { failure, requireAdmin } from "@/lib/admin-auth";
import { setActiveSchema } from "@/lib/admin-schemas";

// Authorization happens inside the database function (called with the admin's own token); only then is sign-in blocked/unblocked.
export async function POST(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const parsed = setActiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure(400, { error: "Invalid input.", fields: parsed.error.flatten().fieldErrors });
  const { userId, active, reason } = parsed.data;
  const result = await ctx.userClient.rpc("set_user_active", { target: userId, make_active: active, reason: reason ?? null });
  if (result.error) return failure(403, { error: result.error.message });
  const ban = await ctx.service.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  if (ban.error) return failure(500, { error: `Profile updated (database access is already ${active ? "restored" : "blocked"}), but changing the sign-in block failed: ${ban.error.message}` });
  return failure(200, { ok: true });
}

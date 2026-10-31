import { failure, requireAdmin } from "@/lib/admin-auth";
import { createUserSchema, redirectBase } from "@/lib/admin-schemas";

// Creates an invited user with no password. The administrator receives a one-time link to hand over out-of-band;
// the user chooses their own password on /set-password. No password ever passes through this server.
export async function POST(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure(400, { error: "Invalid input.", fields: parsed.error.flatten().fieldErrors });
  const { email, displayName, companyId, role } = parsed.data;
  if (!ctx.adminCompanies.includes(companyId)) return failure(403, { error: "You do not administer that company." });
  const base = redirectBase(process.env.APP_URL, request.headers.get("origin"));
  if (!base) return failure(500, { error: "Set APP_URL so invite links point to the application." });

  const link = await ctx.service.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: `${base}/set-password` } });
  if (link.error || !link.data.user) return failure(link.error?.message?.toLowerCase().includes("already") ? 409 : 500, { error: link.error?.message ?? "Could not create the invitation." });
  const newId = link.data.user.id;
  const rollback = async (message: string) => { await ctx.service.auth.admin.deleteUser(newId); return failure(500, { error: message }); };

  const profile = await ctx.service.from("user_profiles").insert({ id: newId, display_name: displayName, active: true });
  if (profile.error) return rollback(`Could not create the profile: ${profile.error.message}`);
  const assignment = await ctx.service.from("user_company_roles").insert({ user_id: newId, company_id: companyId, role });
  if (assignment.error) { await ctx.service.from("user_profiles").delete().eq("id", newId); return rollback(`Could not assign the role: ${assignment.error.message}`); }
  await ctx.service.from("audit_logs").insert({ actor_id: ctx.userId, action: "user_created", entity_type: "user", entity_id: newId, company_id: companyId, after_value: { role, email_domain: email.split("@")[1] } });
  return failure(200, { userId: newId, inviteLink: link.data.properties.action_link });
}

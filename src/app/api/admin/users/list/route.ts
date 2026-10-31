import { failure, requireAdmin } from "@/lib/admin-auth";

// POST (never cached): returns users visible to the calling administrator, with roles limited to the companies they administer.
export async function POST(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { service, adminCompanies } = ctx;
  const [users, profiles, roles, access] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 1000 }), service.from("user_profiles").select("id,display_name,active"),
    service.from("user_company_roles").select("user_id,company_id,role"), service.from("user_branch_access").select("user_id,branch_id"),
  ]);
  const err = users.error ?? profiles.error ?? roles.error ?? access.error;
  if (err) return failure(500, { error: `Could not load users: ${err.message}` });
  const roleRows = roles.data ?? []; const accessRows = access.data ?? [];
  const mine = new Set(adminCompanies); const withAnyRole = new Set(roleRows.map((r) => r.user_id));
  const profileById = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  const visible = users.data.users.filter((u) => !withAnyRole.has(u.id) || roleRows.some((r) => r.user_id === u.id && mine.has(r.company_id)));
  return failure(200, {
    users: visible.map((u) => ({
      id: u.id, email: u.email ?? null, displayName: profileById.get(u.id)?.display_name ?? null, hasProfile: profileById.has(u.id), active: profileById.get(u.id)?.active ?? false, lastSignInAt: u.last_sign_in_at ?? null,
      roles: roleRows.filter((r) => r.user_id === u.id && mine.has(r.company_id)).map((r) => ({ companyId: r.company_id, role: r.role })),
      branchIds: accessRows.filter((a) => a.user_id === u.id).map((a) => a.branch_id),
    })),
  });
}

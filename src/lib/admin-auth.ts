// SERVER ONLY: imported exclusively from route handlers. It reads SUPABASE_SERVICE_ROLE_KEY, which must never reach the browser.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AdminContext = { userId: string; userClient: SupabaseClient; service: SupabaseClient; adminCompanies: string[] };

export const failure = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Verifies the caller from their own access token and confirms in the database that they are a system administrator.
 * The service-role client is created only AFTER that check passes, and never leaves the server.
 */
export async function requireAdmin(request: Request): Promise<AdminContext | Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return failure(503, { error: "Supabase is not configured." });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return failure(401, { error: "Sign in required." });
  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who, error: whoError } = await userClient.auth.getUser(token);
  if (whoError || !who.user) return failure(401, { error: "Invalid or expired session." });
  const roles = await userClient.from("user_company_roles").select("company_id").eq("role", "system_administrator");
  if (roles.error) return failure(500, { error: "Could not verify permissions." });
  const adminCompanies = roles.data.map((r) => r.company_id as string);
  if (adminCompanies.length === 0) return failure(403, { error: "System administrator role required." });
  if (!serviceKey) return failure(503, { error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server." });
  return { userId: who.user.id, userClient, adminCompanies, service: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

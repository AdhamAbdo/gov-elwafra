// SERVER ONLY (route handlers). Verifies the caller's own session; the service-role client is created only after that
// succeeds and is used solely for storage operations that a database function has already authorized.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type UserContext = { userId: string; userClient: SupabaseClient; service: SupabaseClient };

export const respond = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function requireUser(request: Request): Promise<UserContext | Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return respond(503, { error: "Supabase is not configured." });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return respond(401, { error: "Sign in required." });
  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return respond(401, { error: "Invalid or expired session." });
  if (!serviceKey) return respond(503, { error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server." });
  return { userId: data.user.id, userClient, service: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

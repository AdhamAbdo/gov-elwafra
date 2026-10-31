import { z } from "zod";

export const ROLES = ["general_manager", "company_manager", "compliance_officer", "system_administrator", "read_only"] as const;
export type RoleName = (typeof ROLES)[number];

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().min(2).max(120),
  companyId: z.string().uuid(),
  role: z.enum(ROLES),
});
export const setActiveSchema = z.object({ userId: z.string().uuid(), active: z.boolean(), reason: z.string().trim().max(500).optional() })
  .refine((v) => v.active || !!v.reason, { message: "reason is required to deactivate a user", path: ["reason"] });

/** Where invite/reset links should send the user. Only an explicitly configured APP_URL or the request's own origin is used. */
export function redirectBase(appUrl: string | undefined, requestOrigin: string | null): string | null {
  const candidate = appUrl || requestOrigin;
  if (!candidate) return null;
  try { const u = new URL(candidate); return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null; } catch { return null; }
}

/** Client-side password policy for choosing a password (Supabase enforces its own minimum as well). Returns an Arabic message or null. */
export function newPasswordError(password: string, confirm: string): string | null {
  if (password.length < 10) return "كلمة المرور يجب ألا تقل عن 10 أحرف.";
  if (!/[A-Za-z؀-ۿ]/.test(password) || !/\d/.test(password)) return "يجب أن تحتوي كلمة المرور على أحرف وأرقام.";
  if (password !== confirm) return "تأكيد كلمة المرور غير مطابق.";
  return null;
}

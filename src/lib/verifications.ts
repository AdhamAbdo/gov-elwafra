import { z } from "zod";

export const PLATFORMS = ["qiwa", "gosi", "mudad", "nitaqat", "balady", "sfda", "civil_defense"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const OUTCOMES = ["no_issue", "issue_found", "unable_to_verify"] as const;

const blank = (v: string | undefined) => !v || !v.trim();
const count = z.string().trim().regex(/^\d+$/, "رقم صحيح غير سالب مطلوب");

/** Mirrors the platform_verifications table constraints so users get field-level errors before a round trip. */
export const verificationSchema = z.object({
  platform: z.enum(PLATFORMS), companyId: z.string().uuid("اختر الشركة"), outcome: z.enum(OUTCOMES),
  observedStatus: z.string().trim().min(1, "الحالة الظاهرة في المنصة مطلوبة"),
  wagePeriod: z.string().optional(), notes: z.string().optional(), followUpAction: z.string().optional(),
  nitaqatClass: z.string().optional(), nitaqatTotal: z.string().optional(), nitaqatSaudi: z.string().optional(),
}).superRefine((v, ctx) => {
  const add = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (!blank(v.wagePeriod)) { if (v.platform !== "mudad") add("wagePeriod", "فترة الأجور خاصة بمنصة مدد"); else if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v.wagePeriod!)) add("wagePeriod", "صيغة الفترة غير صحيحة (YYYY-MM)"); }
  if (v.outcome === "issue_found") { if (blank(v.notes)) add("notes", "الملاحظات مطلوبة عند وجود مشكلة"); if (blank(v.followUpAction)) add("followUpAction", "إجراء المتابعة مطلوب عند وجود مشكلة"); }
  if (v.platform === "nitaqat" && v.outcome !== "unable_to_verify") {
    if (blank(v.nitaqatClass)) add("nitaqatClass", "التصنيف الرسمي الظاهر في المنصة مطلوب");
    if (!count.safeParse(v.nitaqatTotal ?? "").success) add("nitaqatTotal", "إجمالي العاملين مطلوب (رقم صحيح)");
    if (!count.safeParse(v.nitaqatSaudi ?? "").success) add("nitaqatSaudi", "عدد السعوديين مطلوب (رقم صحيح)");
  }
  if (v.platform === "nitaqat" && count.safeParse(v.nitaqatTotal ?? "").success && count.safeParse(v.nitaqatSaudi ?? "").success && Number(v.nitaqatSaudi) > Number(v.nitaqatTotal)) add("nitaqatSaudi", "عدد السعوديين لا يمكن أن يتجاوز إجمالي العاملين");
});

export function verificationErrors(input: unknown): Record<string, string> {
  const r = verificationSchema.safeParse(input);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

/** Whole days since the last manual verification (Riyadh calendar days); null when there is none. */
export function daysSinceVerification(verifiedAt: string | null, now: Date): number | null {
  if (!verifiedAt) return null;
  const day = (d: Date) => Math.floor((d.getTime() + 3 * 36e5) / 864e5);
  return day(now) - day(new Date(verifiedAt));
}

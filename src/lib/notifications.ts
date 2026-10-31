export type EmailStatus = "not_requested" | "pending" | "accepted_by_provider" | "failed" | "skipped_unconfigured";
export const MAX_EMAIL_ATTEMPTS = 5;
const RETRY_DELAY_MINUTES = [5, 15, 60, 240];

/** Whether the dispatcher should try to send this notification's email now. Acceptance by the provider is final here (it is not proof of delivery). */
export function shouldAttemptEmail(n: { status: EmailStatus; attempts: number; lastAttemptAt: string | null }, now: Date): boolean {
  if (n.status === "pending" || n.status === "skipped_unconfigured") return true;
  if (n.status !== "failed" || n.attempts >= MAX_EMAIL_ATTEMPTS) return false;
  if (!n.lastAttemptAt) return true;
  const delay = RETRY_DELAY_MINUTES[Math.min(n.attempts, RETRY_DELAY_MINUTES.length) - 1] ?? RETRY_DELAY_MINUTES[0];
  return now.getTime() - new Date(n.lastAttemptAt).getTime() >= delay * 6e4;
}

/** Email content is deliberately generic: only the notification title and a link, never record details. */
export function buildEmail(n: { title: string }, appUrl: string): { subject: string; text: string } {
  return { subject: `${n.title} — نظام الحوكمة والامتثال`, text: `لديك إشعار جديد في نظام الحوكمة والامتثال: ${n.title}\nسجّل الدخول للاطلاع على التفاصيل: ${appUrl.replace(/\/$/, "")}/notifications` };
}

/** Where an in-app notification should link to. */
export function notificationHref(entityType: string | null): string {
  switch (entityType) {
    case "license": return "/licenses";
    case "contract": case "employee_event": return "/employees";
    default: return "/";
  }
}

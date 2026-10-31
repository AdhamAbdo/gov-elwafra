export type CycleTask = { compliance: string | null; review: string | null };
export type CycleSummary = { total: number; compliantApproved: number; actionRequired: number; awaitingReview: number; unverified: number; notApplicable: number; denominator: number };

/**
 * Per-cycle tally with explicit definitions:
 * - no check, or a check still "not_verified"  -> unverified (never compliant)
 * - a result not yet approved (pending/returned/escalated) -> awaitingReview (not counted as compliant)
 * - approved compliant / action_required / not_applicable -> their own buckets
 * denominator = total tasks minus approved not-applicable ones.
 */
export type TaskBucket = "compliantApproved" | "actionRequired" | "awaitingReview" | "unverified" | "notApplicable";
export function taskBucket(t: CycleTask): TaskBucket {
  if (!t.compliance || t.compliance === "not_verified") return "unverified";
  if (t.review !== "approved") return "awaitingReview";
  if (t.compliance === "compliant") return "compliantApproved";
  if (t.compliance === "action_required") return "actionRequired";
  if (t.compliance === "not_applicable") return "notApplicable";
  return "unverified";
}

export function summarizeCycle(tasks: CycleTask[]): CycleSummary {
  const s: CycleSummary = { total: tasks.length, compliantApproved: 0, actionRequired: 0, awaitingReview: 0, unverified: 0, notApplicable: 0, denominator: 0 };
  for (const t of tasks) s[taskBucket(t)]++;
  s.denominator = s.total - s.notApplicable;
  return s;
}

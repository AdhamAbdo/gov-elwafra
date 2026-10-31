import { summarizeCycle, taskBucket, type CycleSummary, type TaskBucket } from "./cycle-summary";

export type DashTask = {
  cycleId: string; companyId: string; branchId: string | null; assignedTo: string | null;
  category: string; authority: string | null; risk: string; compliance: string | null; review: string | null;
};
export type DashFilters = { companyId?: string; branchId?: string; category?: string; authority?: string; ownerId?: string; state?: TaskBucket | "" };

export function filterTasks(tasks: DashTask[], f: DashFilters): DashTask[] {
  return tasks.filter((t) => (!f.companyId || t.companyId === f.companyId) && (!f.branchId || t.branchId === f.branchId) && (!f.category || t.category === f.category)
    && (!f.authority || t.authority === f.authority) && (!f.ownerId || (f.ownerId === "unassigned" ? t.assignedTo === null : t.assignedTo === f.ownerId)) && (!f.state || taskBucket(t) === f.state));
}

/** Percentage 0-100, or null when the denominator is zero (no data is not 0%). */
export const pct = (n: number, d: number): number | null => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

/**
 * Explicit definitions:
 * - completion = tasks with a submitted result (any outcome) / all tasks in the cycle
 * - compliance = approved-compliant tasks / (all tasks - approved not-applicable); unverified and unapproved tasks stay in the denominator
 */
export function cycleRates(tasks: DashTask[]): { summary: CycleSummary; completion: number | null; compliance: number | null } {
  const summary = summarizeCycle(tasks);
  return { summary, completion: pct(tasks.filter((t) => t.compliance !== null).length, tasks.length), compliance: pct(summary.compliantApproved, summary.denominator) };
}

export type TrendPoint = { cycleId: string; label: string; completion: number | null; compliance: number | null; tasks: number };
/** One point per cycle, oldest first, built only from the supplied historical tasks. */
export function buildTrend(cycles: { id: string; startsOn: string }[], tasks: DashTask[]): TrendPoint[] {
  return [...cycles].sort((a, b) => a.startsOn.localeCompare(b.startsOn)).map((c) => {
    const own = tasks.filter((t) => t.cycleId === c.id); const r = cycleRates(own);
    return { cycleId: c.id, label: c.startsOn, completion: r.completion, compliance: r.compliance, tasks: own.length };
  });
}

/** Tasks from cycles that have ended and still have no submitted result. */
export function overdueTasks(tasks: DashTask[], endedCycleIds: Set<string>): DashTask[] {
  return tasks.filter((t) => endedCycleIds.has(t.cycleId) && t.compliance === null);
}

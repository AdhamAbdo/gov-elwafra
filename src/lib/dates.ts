export type DeadlineState = "expired" | "critical" | "warning" | "ok";
export const RIYADH = "Asia/Riyadh";
const RIYADH_OFFSET_MS = 3 * 36e5; // Asia/Riyadh is UTC+3 year-round (no DST).
const DAY_MS = 864e5;
/** Sunday 00:00 through Saturday 23:59:59.999 in Asia/Riyadh, returned as real instants. */
export function weeklyCycle(date: Date) { const local = new Date(date.getTime() + RIYADH_OFFSET_MS); const dayStart = Math.floor(local.getTime() / DAY_MS) * DAY_MS; const start = dayStart - local.getUTCDay() * DAY_MS; return { start: new Date(start - RIYADH_OFFSET_MS), end: new Date(start + 7 * DAY_MS - 1 - RIYADH_OFFSET_MS) }; }
/** The cycle's Riyadh calendar dates (YYYY-MM-DD), as stored in review_cycles.starts_on / ends_on. */
export function weeklyCycleDates(date: Date) { const { start, end } = weeklyCycle(date); const day = (d: Date) => new Date(d.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10); return { startsOn: day(start), endsOn: day(end) }; }
export function deadlineState(expiry: Date, now: Date, thresholds: number[]): DeadlineState { const hours = (expiry.getTime() - now.getTime()) / 36e5; if (hours < 0) return "expired"; if (hours < 24) return "critical"; return thresholds.some((d) => hours <= d * 24) ? "warning" : "ok"; }
export function inspectionCompliance(hasCurrentCheck: boolean, result?: "compliant" | "action_required" | "not_verified" | "not_applicable") { return hasCurrentCheck ? result ?? "not_verified" : "not_verified"; }

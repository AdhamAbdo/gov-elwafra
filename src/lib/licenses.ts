export type LicenseState = "expired" | "within_7" | "within_30" | "within_60" | "within_90" | "ok";
export const LICENSE_THRESHOLDS = [90, 60, 30, 7] as const;
const RIYADH_OFFSET_MS = 3 * 36e5;
const DAY_MS = 864e5;

const riyadhDay = (instant: Date) => Math.floor((instant.getTime() + RIYADH_OFFSET_MS) / DAY_MS);

/** Whole Riyadh calendar days from `now` until the expiry date (YYYY-MM-DD). 0 = expires today; negative = expired. */
export function daysUntilExpiry(expiryDate: string, now: Date): number {
  const [y, m, d] = expiryDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS - riyadhDay(now);
}

/** Warning bucket from the recorded expiry date. Thresholds are days before expiry (default 90/60/30/7). */
export function licenseState(expiryDate: string, now: Date, thresholds: readonly number[] = LICENSE_THRESHOLDS): LicenseState {
  const days = daysUntilExpiry(expiryDate, now);
  if (days < 0) return "expired";
  const hit = [...thresholds].sort((a, b) => a - b).find((t) => days <= t);
  return hit === undefined ? "ok" : (`within_${hit}` as LicenseState);
}

/** Warning state for display. A license that has been superseded by a linked renewal no longer raises expiry warnings; its record is kept as history. */
export function effectiveLicenseState(renewalStatus: string, expiryDate: string, now: Date): LicenseState | "superseded" { return renewalStatus === "renewed" ? "superseded" : licenseState(expiryDate, now); }

export type ContractState = "expired" | "critical" | "within_7" | "within_14" | "within_30" | "ok" | "open_ended" | "superseded" | "closed";
export const CONTRACT_THRESHOLDS = [30, 14, 7] as const;

/**
 * Expiry warning for a contract. Exact instants are used (ends_at is a timestamptz), so "critical" means
 * under 24 hours remain. A contract whose status is 'renewed' is superseded by its linked successor and never
 * produces an expiry warning; terminated/expired-status contracts are closed.
 */
export function contractState(status: string, endsAt: string | null, now: Date, thresholds: readonly number[] = CONTRACT_THRESHOLDS): ContractState {
  if (status === "renewed") return "superseded";
  if (status !== "active") return "closed";
  if (!endsAt) return "open_ended";
  const hours = (new Date(endsAt).getTime() - now.getTime()) / 36e5;
  if (hours < 0) return "expired";
  if (hours < 24) return "critical";
  const hit = [...thresholds].sort((a, b) => a - b).find((t) => hours <= t * 24);
  return hit === undefined ? "ok" : (`within_${hit}` as ContractState);
}

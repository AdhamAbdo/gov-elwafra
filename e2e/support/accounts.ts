import { existsSync, readFileSync } from "node:fs";

// Credentials are read from docs/demo-accounts.txt at run time and never copied into the tests or logged.
export type Role = "admin" | "manager" | "officer" | "viewer";
export type Account = { role: Role; displayName: string; email: string; password: string };

const FILE = "docs/demo-accounts.txt";
// One account per role is enough: the Bakery company's manager/officer/viewer, plus the system administrator.
const WANTED: Record<Role, string> = { admin: "admin@governance.local", manager: "manager@alwafra.local", officer: "compliance@alwafra.local", viewer: "viewer@alwafra.local" };

function parse(): Map<string, Account> {
  if (!existsSync(FILE)) throw new Error(`${FILE} not found: the E2E suite signs in with the demo accounts documented there.`);
  const byEmail = new Map<string, Account>();
  for (const line of readFileSync(FILE, "utf8").split(/\r?\n/)) {
    if (!line.startsWith("|") || !line.includes("@") || line.includes("Email")) continue;
    const [displayName, , , email, password] = line.split("|").slice(1, -1).map((c) => c.trim());
    if (email && password) byEmail.set(email, { role: "viewer", displayName, email, password });
  }
  return byEmail;
}

export function accounts(): Record<Role, Account> {
  const all = parse();
  const out = {} as Record<Role, Account>;
  for (const [role, email] of Object.entries(WANTED) as [Role, string][]) {
    const found = all.get(email);
    if (!found) throw new Error(`Demo account ${email} (${role}) is missing from ${FILE}.`);
    out[role] = { ...found, role };
  }
  return out;
}

export const ROLES: Role[] = ["admin", "manager", "officer", "viewer"];
export const authFile = (role: Role) => `e2e/.auth/${role}.json`;

/**
 * Supabase sign-out is GLOBAL: it revokes every session of that user, including the saved ones the other specs reuse.
 * The sign-out test therefore uses an account no other spec signs in with.
 */
export function signOutProbe(): Account {
  const found = parse().get("viewer@sawafi.local");
  if (!found) throw new Error(`Demo account viewer@sawafi.local is missing from ${FILE}.`);
  return { ...found, role: "viewer" };
}

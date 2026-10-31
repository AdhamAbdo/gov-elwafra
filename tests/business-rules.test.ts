import { describe, expect, it } from "vitest";
import { deadlineState, inspectionCompliance, weeklyCycle, weeklyCycleDates } from "../src/lib/dates";
describe("core business rules", () => {
  it("uses Sunday through Saturday cycles in Asia/Riyadh", () => { expect(weeklyCycleDates(new Date("2026-10-19T12:00:00Z"))).toEqual({ startsOn: "2026-10-18", endsOn: "2026-10-24" }); const c = weeklyCycle(new Date("2026-10-19T12:00:00Z")); expect(c.start.toISOString()).toBe("2026-10-17T21:00:00.000Z"); expect(c.end.toISOString()).toBe("2026-10-24T20:59:59.999Z"); });
  it("starts the new cycle at Sunday 00:00 Riyadh, not UTC midnight", () => { expect(weeklyCycleDates(new Date("2026-10-17T20:59:59Z")).startsOn).toBe("2026-10-11"); expect(weeklyCycleDates(new Date("2026-10-17T21:00:00Z")).startsOn).toBe("2026-10-18"); expect(weeklyCycleDates(new Date("2026-10-24T20:59:59Z")).startsOn).toBe("2026-10-18"); });
  it("does not report missing inspection as compliant", () => expect(inspectionCompliance(false, "compliant")).toBe("not_verified"));
  it("flags license deadlines", () => { const now = new Date("2026-01-01T00:00:00Z"); expect(deadlineState(new Date("2025-12-31"), now, [90,60,30,7])).toBe("expired"); expect(deadlineState(new Date("2026-01-05"), now, [90,60,30,7])).toBe("warning"); });
});

import { daysUntilExpiry, licenseState } from "../src/lib/licenses";
describe("license warnings", () => {
  const now = new Date("2026-10-23T10:00:00Z"); // 13:00 Riyadh, 23 Oct
  it("counts Riyadh calendar days; a license expiring today is not yet expired", () => { expect(daysUntilExpiry("2026-10-23", now)).toBe(0); expect(licenseState("2026-10-23", now)).toBe("within_7"); expect(licenseState("2026-10-22", now)).toBe("expired"); });
  it("uses the Riyadh date near the UTC day boundary", () => { const lateUtc = new Date("2026-10-23T21:30:00Z"); expect(daysUntilExpiry("2026-10-24", lateUtc)).toBe(0); });
  it("buckets by the 90/60/30/7 thresholds", () => { expect(licenseState("2026-10-30", now)).toBe("within_7"); expect(licenseState("2026-11-10", now)).toBe("within_30"); expect(licenseState("2026-12-01", now)).toBe("within_60"); expect(licenseState("2027-01-10", now)).toBe("within_90"); expect(licenseState("2027-06-01", now)).toBe("ok"); });
  it("honours configured thresholds", () => expect(licenseState("2026-11-10", now, [14])).toBe("ok"));
});

import { effectiveLicenseState } from "../src/lib/licenses";
describe("license renewal history", () => { it("does not warn about a superseded license, but does about an unrenewed expired one", () => { const now = new Date("2026-10-23T10:00:00Z"); expect(effectiveLicenseState("renewed", "2025-01-01", now)).toBe("superseded"); expect(effectiveLicenseState("in_progress", "2025-01-01", now)).toBe("expired"); }); });

import { contractState } from "../src/lib/contracts";
describe("contract warnings", () => {
  const now = new Date("2026-10-23T10:00:00Z");
  it("goes critical under 24 hours and expired after the end", () => { expect(contractState("active", "2026-10-24T09:00:00Z", now)).toBe("critical"); expect(contractState("active", "2026-10-23T09:59:00Z", now)).toBe("expired"); });
  it("buckets by 30/14/7 days", () => { expect(contractState("active", "2026-10-30T10:00:00Z", now)).toBe("within_7"); expect(contractState("active", "2026-11-05T10:00:00Z", now)).toBe("within_14"); expect(contractState("active", "2026-11-20T10:00:00Z", now)).toBe("within_30"); expect(contractState("active", "2027-03-01T00:00:00Z", now)).toBe("ok"); });
  it("does not warn for renewed, closed or open-ended contracts", () => { expect(contractState("renewed", "2026-10-24T00:00:00Z", now)).toBe("superseded"); expect(contractState("terminated", "2026-10-24T00:00:00Z", now)).toBe("closed"); expect(contractState("active", null, now)).toBe("open_ended"); });
});

import { summarizeCycle } from "../src/lib/cycle-summary";
describe("cycle summary", () => {
  it("never counts unverified or unapproved results as compliant", () => { const s = summarizeCycle([{ compliance: null, review: null }, { compliance: "not_verified", review: "approved" }, { compliance: "compliant", review: "pending_review" }, { compliance: "compliant", review: "returned" }, { compliance: "compliant", review: "approved" }, { compliance: "action_required", review: "approved" }, { compliance: "not_applicable", review: "approved" }]); expect(s).toEqual({ total: 7, compliantApproved: 1, actionRequired: 1, awaitingReview: 2, unverified: 2, notApplicable: 1, denominator: 6 }); });
  it("handles an empty cycle", () => expect(summarizeCycle([]).denominator).toBe(0));
});

import { verificationErrors, daysSinceVerification } from "../src/lib/verifications";
describe("platform verification rules", () => {
  const base = { platform: "gosi", companyId: "7c3f0b1e-5a52-4c61-9f5c-0d0f5d1a2b3c", outcome: "no_issue", observedStatus: "ملتزم" };
  it("accepts a clean record", () => expect(verificationErrors(base)).toEqual({}));
  it("requires notes and a follow-up when an issue is found", () => expect(Object.keys(verificationErrors({ ...base, outcome: "issue_found" })).sort()).toEqual(["followUpAction", "notes"]));
  it("only allows a wage period for Mudad, in YYYY-MM form", () => { expect(verificationErrors({ ...base, wagePeriod: "2026-09" }).wagePeriod).toBeDefined(); expect(verificationErrors({ ...base, platform: "mudad", wagePeriod: "2026-09" })).toEqual({}); expect(verificationErrors({ ...base, platform: "mudad", wagePeriod: "2026-13" }).wagePeriod).toBeDefined(); });
  it("requires the observed official Nitaqat classification and figures", () => { expect(Object.keys(verificationErrors({ ...base, platform: "nitaqat" })).sort()).toEqual(["nitaqatClass", "nitaqatSaudi", "nitaqatTotal"]); expect(verificationErrors({ ...base, platform: "nitaqat", nitaqatClass: "أخضر", nitaqatTotal: "10", nitaqatSaudi: "11" }).nitaqatSaudi).toBeDefined(); expect(verificationErrors({ ...base, platform: "nitaqat", nitaqatClass: "أخضر", nitaqatTotal: "10", nitaqatSaudi: "4" })).toEqual({}); });
  it("does not demand Nitaqat figures when the portal could not be verified", () => expect(verificationErrors({ ...base, platform: "nitaqat", outcome: "unable_to_verify" })).toEqual({}));
  it("counts days since the last verification", () => { expect(daysSinceVerification(null, new Date())).toBeNull(); expect(daysSinceVerification("2026-10-20T10:00:00Z", new Date("2026-10-23T10:00:00Z"))).toBe(3); });
});

import { buildEmail, notificationHref, shouldAttemptEmail } from "../src/lib/notifications";
import { createEmailProvider } from "../src/lib/email";
describe("notification delivery rules", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  it("sends pending and retries unconfigured, but never re-sends provider-accepted mail", () => { expect(shouldAttemptEmail({ status: "pending", attempts: 0, lastAttemptAt: null }, now)).toBe(true); expect(shouldAttemptEmail({ status: "skipped_unconfigured", attempts: 0, lastAttemptAt: null }, now)).toBe(true); expect(shouldAttemptEmail({ status: "accepted_by_provider", attempts: 1, lastAttemptAt: "2026-10-23T11:00:00Z" }, now)).toBe(false); expect(shouldAttemptEmail({ status: "not_requested", attempts: 0, lastAttemptAt: null }, now)).toBe(false); });
  it("backs off failed sends and stops after the attempt limit", () => { expect(shouldAttemptEmail({ status: "failed", attempts: 1, lastAttemptAt: "2026-10-23T11:58:00Z" }, now)).toBe(false); expect(shouldAttemptEmail({ status: "failed", attempts: 1, lastAttemptAt: "2026-10-23T11:54:00Z" }, now)).toBe(true); expect(shouldAttemptEmail({ status: "failed", attempts: 5, lastAttemptAt: "2026-10-01T00:00:00Z" }, now)).toBe(false); });
  it("keeps email content generic", () => { const m = buildEmail({ title: "ترخيص منتهي" }, "https://app.example/"); expect(m.text).toContain("https://app.example/notifications"); expect(m.text).not.toMatch(/\d{4}-\d{2}-\d{2}/); });
  it("routes entity types to pages", () => { expect(notificationHref("license")).toBe("/licenses"); expect(notificationHref("employee_event")).toBe("/employees"); expect(notificationHref(null)).toBe("/"); });
  it("reports no provider when email is unconfigured, and classifies provider responses honestly", async () => { expect(createEmailProvider({})).toBeNull(); const ok = createEmailProvider({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" }, (async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 })) as typeof fetch); expect(await ok!.send({ to: "x@y.z", subject: "s", text: "t" })).toMatchObject({ outcome: "accepted", providerId: "m1" }); const bad = createEmailProvider({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" }, (async () => new Response("no", { status: 422 })) as typeof fetch); expect((await bad!.send({ to: "x", subject: "s", text: "t" })).outcome).toBe("rejected"); const down = createEmailProvider({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" }, (async () => { throw new Error("offline"); }) as typeof fetch); expect((await down!.send({ to: "x", subject: "s", text: "t" })).outcome).toBe("error"); });
});

import { buildTrend, cycleRates, filterTasks, overdueTasks, pct, type DashTask } from "../src/lib/dashboard";
const T = (o: Partial<DashTask>): DashTask => ({ cycleId: "c1", companyId: "A", branchId: null, assignedTo: null, category: "safety", authority: null, risk: "medium", compliance: null, review: null, ...o });
describe("dashboard metrics", () => {
  it("returns null, not 0, when there is nothing to measure", () => { expect(pct(0, 0)).toBeNull(); expect(cycleRates([]).compliance).toBeNull(); });
  it("keeps unverified and unapproved tasks in the compliance denominator", () => { const r = cycleRates([T({ compliance: "compliant", review: "approved" }), T({ compliance: "compliant", review: "pending_review" }), T({}), T({ compliance: "not_applicable", review: "approved" })]); expect(r.compliance).toBe(33.3); expect(r.completion).toBe(75); });
  it("filters by company, owner (incl. unassigned) and state", () => { const ts = [T({ companyId: "A", assignedTo: "u1", compliance: "compliant", review: "approved" }), T({ companyId: "B" })]; expect(filterTasks(ts, { companyId: "B" })).toHaveLength(1); expect(filterTasks(ts, { ownerId: "unassigned" })).toHaveLength(1); expect(filterTasks(ts, { state: "compliantApproved" })).toHaveLength(1); });
  it("builds the trend from actual per-cycle records, oldest first, with gaps for empty cycles", () => { const t = buildTrend([{ id: "c2", startsOn: "2026-10-18" }, { id: "c1", startsOn: "2026-10-11" }, { id: "c0", startsOn: "2026-10-04" }], [T({ cycleId: "c1", compliance: "compliant", review: "approved" }), T({ cycleId: "c2" })]); expect(t.map((p) => p.label)).toEqual(["2026-10-04", "2026-10-11", "2026-10-18"]); expect(t[0].compliance).toBeNull(); expect(t[1].compliance).toBe(100); expect(t[2].compliance).toBe(0); });
  it("flags only ended-cycle tasks without a result as overdue", () => expect(overdueTasks([T({ cycleId: "old" }), T({ cycleId: "old", compliance: "compliant" }), T({ cycleId: "now" })], new Set(["old"]))).toHaveLength(1));
});

import { createUserSchema, newPasswordError, redirectBase, setActiveSchema } from "../src/lib/admin-schemas";
describe("user administration input rules", () => {
  const id = "7c3f0b1e-5a52-4c61-9f5c-0d0f5d1a2b3c";
  it("normalises the invite email and rejects unknown roles", () => { expect(createUserSchema.parse({ email: " Ali@Example.COM ", displayName: "علي", companyId: id, role: "read_only" }).email).toBe("ali@example.com"); expect(createUserSchema.safeParse({ email: "a@b.co", displayName: "علي", companyId: id, role: "root" }).success).toBe(false); });
  it("requires a reason to deactivate but not to reactivate", () => { expect(setActiveSchema.safeParse({ userId: id, active: false }).success).toBe(false); expect(setActiveSchema.safeParse({ userId: id, active: false, reason: "left the company" }).success).toBe(true); expect(setActiveSchema.safeParse({ userId: id, active: true }).success).toBe(true); });
  it("only trusts http(s) redirect origins", () => { expect(redirectBase("https://app.example.com/path", null)).toBe("https://app.example.com"); expect(redirectBase(undefined, "http://localhost:3000")).toBe("http://localhost:3000"); expect(redirectBase("javascript:alert(1)", null)).toBeNull(); expect(redirectBase(undefined, null)).toBeNull(); });
  it("enforces the password policy", () => { expect(newPasswordError("short1", "short1")).not.toBeNull(); expect(newPasswordError("onlyletterslong", "onlyletterslong")).not.toBeNull(); expect(newPasswordError("goodpassword12", "different12345")).not.toBeNull(); expect(newPasswordError("goodpassword12", "goodpassword12")).toBeNull(); });
});

import { actionLabel, auditDetailRows, formatValue } from "../src/lib/audit-format";
describe("audit log readability", () => {
  it("translates known actions and values, and leaves unknown ones visible", () => { expect(actionLabel("license_renewed")).toBe("تسجيل ترخيص مجدَّد"); expect(actionLabel("something_new")).toBeNull(); expect(formatValue("action_required")).toBe("يتطلب إجراء"); expect(formatValue("custom text")).toBe("custom text"); expect(formatValue(true)).toBe("نعم"); expect(formatValue(null)).toBe("—"); });
  it("shortens ids and formats dates in Riyadh time", () => { expect(formatValue("7c3f0b1e-5a52-4c61-9f5c-0d0f5d1a2b3c")).toBe("…5d1a2b3c"); expect(formatValue("2026-10-23T21:30:00Z")).toBe("24/10/2026, 00:30:00"); expect(formatValue("2026-10-30")).toBe("30/10/2026"); });
  it("builds before/after rows with labelled fields, nested values and one-sided fields", () => { const rows = auditDetailRows({ verified_status: "not_verified" }, { verified_status: "verified_valid", note: "ok" }); expect(rows).toEqual([{ field: "حالة التحقق", before: "لم يتم التحقق", after: "تم التحقق: سارية" }, { field: "ملاحظة", before: null, after: "ok" }]); expect(auditDetailRows(null, { values: [90, 60] })[0]).toEqual({ field: "القيم", before: null, after: "90، 60" }); });
});

describe("audit names", () => { it("resolves ids to names when known and falls back to a short id", () => { const names = new Map([["7c3f0b1e-5a52-4c61-9f5c-0d0f5d1a2b3c", "فرع الرياض"]]); expect(formatValue("7c3f0b1e-5a52-4c61-9f5c-0d0f5d1a2b3c", names)).toBe("فرع الرياض"); expect(formatValue("11111111-5a52-4c61-9f5c-0d0f5d1a2b3c", names)).toBe("…5d1a2b3c"); expect(auditDetailRows(null, { branch_id: "7c3f0b1e-5a52-4c61-9f5c-0d0f5d1a2b3c" }, names)[0].after).toBe("فرع الرياض"); }); });

import { neutralizeFormula, parseCsv, toCsv } from "../src/lib/csv";
import { autoMap, buildRows, licenseKey, parseDate, summarize, type ExistingKeys } from "../src/lib/import-rules";
describe("csv", () => {
  it("round-trips quotes, commas, newlines and Arabic text", () => { const csv = toCsv([{ a: "x, \"y\"", b: "سطر 1\nسطر 2", n: 5 }], [{ key: "a", header: "A" }, { key: "b", header: "ب" }, { key: "n", header: "N" }]); expect(csv.startsWith("\uFEFF")).toBe(true); expect(parseCsv(csv)).toEqual([["A", "ب", "N"], ["x, \"y\"", "سطر 1\nسطر 2", "5"]]); });
  it("neutralises spreadsheet formulas in exported text but not numbers", () => { expect(neutralizeFormula("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")"); expect(neutralizeFormula("@cmd")).toBe("'@cmd"); expect(neutralizeFormula("plain")).toBe("plain"); expect(toCsv([{ n: -3 }], [{ key: "n", header: "n" }])).toContain("\r\n-3\r\n"); });
  it("detects semicolon and tab delimiters, skips blank lines, rejects unclosed quotes", () => { expect(parseCsv("a;b\r\n1;2\r\n\r\n3;4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]); expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]); expect(() => parseCsv("a,b\n\"oops,1")).toThrow(); });
});
describe("import rules", () => {
  const existing: ExistingKeys = { licenses: new Set([licenseKey("LIC-1", "2027-01-01")]), employeeCodes: new Set(["e-1"]), branches: new Set(["فرع الرياض"]) };
  it("parses both date styles and rejects impossible dates", () => { expect(parseDate("2026-10-05")).toBe("2026-10-05"); expect(parseDate("5/10/2026")).toBe("2026-10-05"); expect(parseDate("31/02/2026")).toBeNull(); expect(parseDate("soon")).toBeNull(); });
  it("maps Arabic and English headers automatically", () => { expect(autoMap("licenses", ["رقم الترخيص", "Type", "authority", "تاريخ الانتهاء"])).toMatchObject({ license_number: 0, license_type: 1, authority: 2, expiry_date: 3, issue_date: -1 }); });
  it("validates rows, finds duplicates in the file and in the system, never marks bad rows importable", () => { const map = autoMap("licenses", ["license_type", "authority", "license_number", "expiry_date", "branch"]); const rows = buildRows("licenses", [["بلدية", "بلدي", "LIC-2", "2027-05-01", "فرع الرياض"], ["بلدية", "بلدي", "LIC-2", "2027-05-01", ""], ["بلدية", "بلدي", "LIC-1", "01/01/2027", ""], ["", "بلدي", "LIC-3", "2027-01-01", ""], ["x", "y", "LIC-4", "2027-13-01", "فرع مجهول"]], map, existing); expect(rows.map((r) => [r.line, r.errors.length > 0, r.duplicate])).toEqual([[2, false, null], [3, false, "مكرر داخل الملف"], [4, false, "موجود مسبقاً في النظام (لن يُستبدل)"], [5, true, null], [6, true, null]]); expect(summarize(rows)).toEqual({ total: 5, invalid: 2, duplicates: 2, importable: 1 }); });
  it("checks employee codes case-insensitively against existing data", () => { const map = autoMap("employees", ["code", "name"]); expect(buildRows("employees", [["E-1", "علي"], ["E-2", "سارة"]], map, existing).map((r) => r.duplicate !== null)).toEqual([true, false]); });
});

import { MAX_UPLOAD_BYTES, sanitizeFileName, validateUpload } from "../src/lib/file-validation";
const bytes = (...v: number[]) => new Uint8Array(v);
const file = (name: string, b: Uint8Array) => validateUpload({ name, size: b.length, bytes: b });
const zip = (inner: string) => { const t = new TextEncoder().encode(`PK\x03\x04....[Content_Types].xml....${inner}`); t[0] = 0x50; t[1] = 0x4b; t[2] = 3; t[3] = 4; return t; };
describe("upload validation", () => {
  it("accepts files whose content matches their type", () => { expect(file("a.pdf", bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toMatchObject({ ok: true, mime: "application/pdf" }); expect(file("p.PNG", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toMatchObject({ ok: true, mime: "image/png" }); expect(file("p.jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toMatchObject({ ok: true, mime: "image/jpeg" }); expect(file("d.docx", zip("word/document.xml"))).toMatchObject({ ok: true }); expect(file("s.xlsx", zip("xl/workbook.xml"))).toMatchObject({ ok: true }); expect(file("t.csv", new TextEncoder().encode("a,b\n١,٢"))).toMatchObject({ ok: true, mime: "text/csv" }); });
  it("rejects executables and HTML renamed to an allowed extension", () => { expect(file("invoice.pdf", bytes(0x4d, 0x5a, 0x90, 0))).toMatchObject({ ok: false }); expect(file("pic.png", new TextEncoder().encode("<html><script>alert(1)</script>"))).toMatchObject({ ok: false }); expect(file("x.xlsx", zip("word/document.xml"))).toMatchObject({ ok: false }); });
  it("rejects disallowed extensions, double-extension tricks, empty and oversized files", () => { expect(file("run.exe", bytes(0x4d, 0x5a))).toMatchObject({ ok: false }); expect(file("a.svg", new TextEncoder().encode("<svg/>"))).toMatchObject({ ok: false }); expect(file("noext", bytes(1))).toMatchObject({ ok: false }); expect(file("a.pdf.exe", bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toMatchObject({ ok: false }); expect(validateUpload({ name: "e.pdf", size: 0, bytes: new Uint8Array() })).toMatchObject({ ok: false }); expect(validateUpload({ name: "b.pdf", size: MAX_UPLOAD_BYTES + 1, bytes: bytes(0x25, 0x50, 0x44, 0x46, 0x2d) })).toMatchObject({ ok: false }); });
  it("rejects binary or non-UTF-8 content in a .csv", () => { expect(file("t.csv", bytes(0x61, 0x2c, 0x00, 0x62))).toMatchObject({ ok: false }); expect(file("t.csv", bytes(0xff, 0xfe, 0xfd))).toMatchObject({ ok: false }); });
  it("sanitises names: paths, control and bidi-override characters", () => { expect(sanitizeFileName("..\..\evil/report.pdf")).toBe("report.pdf"); expect(sanitizeFileName("a\u202etxt.pdf")).toBe("atxt.pdf"); expect(sanitizeFileName("   ")).toBe("file"); expect(sanitizeFileName("x".repeat(400) + ".pdf").length).toBe(150); });
});

import { computeLayout, isTallTarget, type Rect } from "../src/lib/tour-layout";
describe("guided tour layout", () => {
  const vp = { width: 1440, height: 900 }; const panel = { width: 520, height: 260 };
  const overlaps = (a: Rect, b: Rect) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
  const panelRect = (l: { top: number; left: number }): Rect => ({ top: l.top, left: l.left, ...panel });
  it("centres the panel when there is no target and points nowhere", () => { const l = computeLayout({ target: null, viewport: vp, panel }); expect(l).toMatchObject({ placement: "center", direction: "none", focus: null }); expect(l.left).toBe(460); });
  it("puts the panel LEFT of a right-edge target (the RTL sidebar) and points right", () => { const target = { top: 64, left: 1184, width: 256, height: 836 }; const l = computeLayout({ target, viewport: vp, panel }); expect(l).toMatchObject({ placement: "left", direction: "right" }); expect(overlaps(panelRect(l), target)).toBe(false); });
  it("puts the panel RIGHT of a left-edge target and points left", () => { const target = { top: 300, left: 20, width: 200, height: 120 }; const l = computeLayout({ target, viewport: vp, panel }); expect(l).toMatchObject({ placement: "right", direction: "left" }); expect(overlaps(panelRect(l), target)).toBe(false); });
  it("goes below a wide target and points up; above it when there is no room below", () => { const wide = { top: 100, left: 40, width: 1100, height: 120 }; const below = computeLayout({ target: wide, viewport: vp, panel }); expect(below).toMatchObject({ placement: "below", direction: "up" }); expect(overlaps(panelRect(below), wide)).toBe(false); const low = { top: 700, left: 40, width: 1360, height: 150 }; const above = computeLayout({ target: low, viewport: vp, panel }); expect(above.placement).toBe("above"); expect(["left", "right"]).toContain(above.direction); expect(overlaps(panelRect(above), low)).toBe(false); });
  it("docks to the bottom on phones and for targets that leave no room, clipping the spotlight above the panel", () => { const phone = computeLayout({ target: { top: 90, left: 12, width: 340, height: 600 }, viewport: { width: 390, height: 800 }, panel: { width: 366, height: 250 } }); expect(phone.placement).toBe("docked"); expect(phone.direction).toBe("up"); expect(phone.focus!.top + phone.focus!.height).toBeLessThan(phone.top); const tall = { top: 90, left: 40, width: 1360, height: 780 }; const d = computeLayout({ target: tall, viewport: vp, panel }); expect(d.placement).toBe("docked"); expect(d.focus!.top + d.focus!.height).toBeLessThanOrEqual(d.top); expect(isTallTarget(tall, vp.height)).toBe(true); expect(isTallTarget({ top: 0, left: 0, width: 100, height: 200 }, vp.height)).toBe(false); });
  it("never places the panel outside the viewport", () => { for (const target of [{ top: 5, left: 5, width: 60, height: 40 }, { top: 860, left: 1380, width: 50, height: 30 }, { top: 400, left: 700, width: 100, height: 100 }]) { const l = computeLayout({ target, viewport: vp, panel }); expect(l.left).toBeGreaterThanOrEqual(0); expect(l.top).toBeGreaterThanOrEqual(0); expect(l.left + panel.width).toBeLessThanOrEqual(vp.width); expect(l.top + panel.height).toBeLessThanOrEqual(vp.height); } });
});

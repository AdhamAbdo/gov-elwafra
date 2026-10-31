# QA report

## Results — 19 October 2026

- `npm run test -- --reporter=verbose`: passed, 2 test files and 6 tests.
- A defect in Sunday–Saturday cycle calculation was found by the test suite and fixed before the passing rerun.
- With `.env.local` configured, `npm run dev` started successfully. `GET /api/health` returned `{"status":"ok","database":"configured_not_verified"}` and the dashboard returned HTTP 200 with RTL and Arabic title markup.
- A direct Supabase REST reachability/RLS probe could not connect because this environment's configured proxy (`127.0.0.1:9`) is unavailable. No remote database read or RLS assertion was made.
- Dashboard milestone: the client now signs in through Supabase Auth and queries inspection tasks through the anon client, so returned records remain constrained by database RLS. The unit suite was rerun after this change and passed (6/6). The local development server started, but first-page compilation did not return in this execution environment; an interactive browser verification is still required.
- Compliance Registry milestone: added migration `202610200003_compliance_registry.sql` and a live, authenticated obligation-creation form. `npx tsc --noEmit` passed and the unit suite passed (6/6). The migration must still be applied and the browser workflow exercised against Supabase.
- Inspection submission milestone: added `202610200004_inspection_submission_security.sql` and a live result/evidence form. The migration tightens submission scope and excludes read-only users. `npx tsc --noEmit` passed; unit tests passed (7/7). This migration must be applied and the authenticated browser workflow remains to be exercised.
- Reviewer workflow milestone: `202610200005_review_and_corrective_action_hardening.sql` was applied to the connected Supabase project on 20 October 2026. Remote function inspection confirmed the pending-review restriction, self-review block, returned-task reset, and action-required corrective-action restriction. The authenticated UI now supports approve, return-with-reason, escalate, corrective-action creation, and corrective-action tracking. `npx tsc --noEmit` and the unit suite passed (7/7); a browser exercise of each role is still outstanding.

## Connected Supabase inspection — 20 October 2026

- Project `Governance & Compliance Management System` is active and healthy on PostgreSQL 17.
- Confirmed database state: 3 `[DEMO]` companies, 3 demo branches, 6 demo obligations, 4 demo inspection tasks, 2 inspection checks, and 1 corrective action.
- Provisioned the 10 accounts documented in `docs/demo-accounts.txt` using the Supabase Auth Admin API: 10 demo Auth users, 18 demo company-role assignments, and 3 branch assignments. There are now 12 active profiles in total.
- All 22 public business tables have RLS enabled.
- Supabase migration history is empty because the SQL files were run manually in SQL Editor rather than recorded through the Supabase migration mechanism. The deployed schema is live, but future changes should use a tracked migration workflow to prevent drift.
- Security Advisor: leaked-password protection is disabled; enable it in Supabase Auth before production use. It also reports RLS-enabled tables without policies, which currently fail closed but must receive reviewed policies when application access is added.
- Security Advisor: helper and workflow `SECURITY DEFINER` functions are exposed to API roles. Their authorization guards are in place, but this requires a dedicated function/RLS audit before production release.
- Performance Advisor: 31 foreign-key index recommendations and three RLS auth-function initialization-plan recommendations remain. No index changes were applied without query-volume evidence.
- `npm run lint`: began but did not return a completion result in this environment.
- `npm run build` and `npm run build -- --webpack`: both remained in compilation without completing; the stale build processes were stopped. The application build is therefore not verified.

Remote Supabase RLS, Auth, Storage, scheduler, email, integration, and Playwright checks are blocked until an isolated Supabase environment and test credentials are configured. No external integration is represented as operational.

The original manually applied schema migrations remain absent from Supabase migration history, but their live functions and tables have been inspected. Unit test cases cover scheduler eligibility, duplicate prevention, idempotency-key stability, self-review prevention, corrective-action state separation, and inspection evidence rules.

## Continuation session — 23 October 2026

- Reinstalled dependencies (`npm install`). `npx tsc --noEmit`, `npm run lint` (0 errors, 0 warnings), `npx vitest run` (8/8) and `npm run build` all pass locally. The earlier "build/lint never returned" note was environmental; both now complete. Dev-server and browser verification per role is still outstanding in this report's scope.
- Defect fixed: `weeklyCycle` used UTC day boundaries, so Sunday 00:00–03:00 Riyadh was assigned to the previous cycle. It now computes Sunday–Saturday in Asia/Riyadh (UTC+3, no DST); boundary tests added.
- Defect fixed: the inspection-task table had 7 headers but 6 cells (compliance result never shown, review status displayed under "النتيجة"). Result and review are now separate columns.
- Defect fixed (lint): synchronous setState inside an effect on the dashboard.
- Added migration `202610230006_corrective_action_lifecycle.sql` (**NOT yet applied to the connected Supabase project**): owner assignment RPC, audited `request_action_verification`, independent closure (owner cannot close their own action; return requires a reason), `mark_overdue_corrective_actions()` (service role), `list_company_assignees()`, own-role read policy, and a branch-scoped `action_read` policy (the previous policy exposed other branches' actions to branch-limited officers).
- Dashboard now exposes assign / request-verification / verification-decision controls for corrective actions. Buttons are UI affordances only; each transition is authorized in the database function. Untested end-to-end until migration 006 is applied.
- Added `scripts/run-scheduler.mjs` (`npm run scheduler`): creates the current Riyadh cycle, generates tasks, marks overdue actions, and records the run in `scheduler_runs`. Syntax-checked only; not executed against Supabase.

## Milestone: routed shell + license management — 23 October 2026

- Added `AppShell` (login gate, header, responsive right-hand sidebar, role context) under the `(app)` route group; the dashboard moved to `/` and a new `/licenses` page was added.
- Added `src/lib/licenses.ts` (Riyadh-calendar-day expiry buckets at 90/60/30/7, superseded-on-renewal rule) with tests. `tsc`, `lint`, `vitest` (13/13) and `build` pass; `/`, `/licenses` and `/api/health` return HTTP 200 from `next start`.
- Added migration `202610230007_license_management.sql` (**NOT yet applied**): audited `create_license`, `verify_license`, `set_license_renewal_progress`, `renew_license` (renewal inserts a new linked record and preserves the old one), new columns (`notes`, `next_action`, `renewal_status`), a verified-status check, and uniqueness changed to (company, number, expiry date) so renewals may keep the same number. The demo seed's `on conflict` clause was updated accordingly. The `/licenses` page selects the new columns, so it will show a load error until the migration is applied.
- Not verified: authenticated browser behaviour per role, and the RPCs against the live database.

## Milestone: employees, contracts, resignations — 23 October 2026

- Added `/employees` (nav: «الموظفون والعقود») with employee list, contracts with expiry state (30/14/7 days, critical under 24 h; renewed/closed/open-ended contracts never warn) and the resignation/termination process table. `src/lib/contracts.ts` is unit-tested. `tsc`, `lint`, `vitest` (16/16) and `build` pass.
- Added migration `202610230008_employees_contracts_events.sql` (**NOT yet applied**): status check constraints, read policies for contracts and events (previously none), employee data hidden from `read_only` users, and audited RPCs `create_employee`, `create_contract`, `verify_contract`, `renew_contract` (new linked record; old kept as `renewed`), `record_employee_event`, `update_employee_event`, `complete_employee_event`. Submitting a resignation/termination never changes `employment_status`; only `complete_employee_event` does, with a recorded non-future effective date. One open process per employee is enforced.
- Not verified: the RPCs and RLS against the live database, and per-role browser behaviour. Until migration 008 is applied the page loads employees but contract/event queries may return empty or error.

## Milestone: companies and branches — 23 October 2026

- Added `/companies` (nav: «الشركات والفروع»): per-company current-cycle compliance summary, attention licenses, open/overdue corrective actions, active/high-risk obligations, and branch management. `src/lib/cycle-summary.ts` defines the metrics explicitly (unverified or unapproved results are never compliant; approved not-applicable tasks leave the denominator) and is unit-tested. `tsc`, `lint`, `vitest` (18/18) and `build` pass.
- Added migration `202610230009_company_branch_management.sql` (**NOT yet applied**): `create_company` (system administrators only; the creator is granted the role on the new company so RLS does not hide it), `update_company`, `set_company_active`, `create_branch`, `update_branch`, `set_branch_active`. Deactivation requires a reason, never deletes, and is blocked while a company has active branches or a branch has active obligations or active employees. All are audited.
- Not verified: the RPCs against the live database and per-role browser behaviour. Migrations 007–009 must be applied in order.

## Milestone: government-platform verification + audit log viewer — 23 October 2026

- Added `/verifications` («المنصات الحكومية»): per-company/per-platform latest-verification matrix (no record = "not verified", never a compliance state), filterable history, manual recording form with field-level validation, and follow-up closure. Nitaqat stores only the officially observed classification and figures; wage period, verification time and next operational deadline are separate fields. `src/lib/verifications.ts` mirrors the database constraints and is unit-tested (24/24 total). `tsc`, `lint` and `build` pass.
- Added `/audit` («سجل التدقيق», managers only in nav): read-only, filterable by company, entity, action, date, with before/after details and "load more".
- Added migration `202610230010_platform_verifications_and_audit.sql` (**NOT yet applied**): `platform_verifications` table (RLS, scope-consistency trigger, constraints for Mudad period/Nitaqat figures/issue-requires-follow-up), `record_platform_verification` and `close_verification_follow_up` RPCs, an immutability trigger (content cannot be edited or deleted; only follow-up closure fields change), an append-only trigger on `audit_logs` (blocks UPDATE/DELETE even for privileged connections), and a security-definer `can_see_profile` policy so managers can see display names of their company's users.
- Not verified: the migration and RPCs against the live database, and browser behaviour per role. Migrations 007–010 must be applied in order.

## Milestone: notification engine — 23 October 2026

- Added `/notifications` (in-app list, mark read/all, unread bell in the header, admin-editable alert thresholds, email-configuration status for administrators) and `GET /api/notifications/config` (returns only a boolean).
- Added `src/lib/notifications.ts` (email retry/backoff policy, generic email content, entity links) and `src/lib/email.ts` (provider interface + Resend adapter that returns `null` when unconfigured). 29/29 unit tests pass, including provider-response classification with a mocked `fetch`. `tsc`, `lint` and `build` pass.
- Added `scripts/run-notifications.mjs` (`npm run notify`): generates notifications, then dispatches pending emails and records the run in `scheduler_runs`; failures are written to `audit_logs`. Syntax-checked only; not executed.
- Added migration `202610230011_notification_engine.sql` (**NOT yet applied**): new notification columns, `notification_preferences`, `notification_settings` (defaults license 90/60/30/7, contract 30/14/7, action-due 3), `generate_deadline_notifications()` (service role; licenses, contracts incl. <24 h critical, overdue/due-soon inspections, returned reviews, escalations, new resignations, due-soon/overdue corrective actions; one row per recipient+event+entity+bucket via a unique key, so reruns create nothing new), read-state RPCs, and `set_notification_thresholds` (system administrators only, audited).
- Email statuses are `pending`, `accepted_by_provider`, `failed`, `skipped_unconfigured` and `not_requested`; the system never records "delivered" because no delivery-confirmation webhook is implemented. The Resend adapter has not been exercised against the real service (no credentials); only its response handling is tested with a mock.
- Not implemented: a per-user preference UI (the table and RPC exist; the generator honours stored preferences), and escalation of repeated overdue reminders.
- Not verified: the generator SQL against the live database. Migrations 007–011 must be applied in order.

## Change: notifications are in-app only by default — 23 October 2026

- Migration `202610230012_notifications_in_app_by_default.sql` (**NOT yet applied**) makes email opt-in: `emit_notification` queues email only when the recipient's stored preference has `email = true`; already-queued email for users who never opted in is set to `not_requested`. Without the migration, generated notifications still default to queuing email (skipped as `skipped_unconfigured` while no provider is configured, so no email is sent either way).
- The notifications page banner no longer implies that email setup is needed. `RESEND_API_KEY` / `EMAIL_FROM` stay optional.

## Milestone: General Manager dashboard + UI redesign — 23 October 2026

- Added the General Manager overview at `/` (`overview-client.tsx`, `src/lib/dashboard.ts`, `src/lib/cycle-summary.ts`): completion rate, approved-compliance rate, action-required / unverified / awaiting-review counts, overdue tasks, license / contract / resignation / corrective-action indicators, company comparison (stacked bars), weekly trend from historical cycles, branch comparison, with filters for cycle, date range, company, branch, category, authority, compliance state and task owner. Definitions are explicit: unverified or unapproved tasks stay in the compliance denominator; empty cycles show as gaps, not 0%. Chart tables are available under «عرض الجدول». If the task query reaches 1,000 rows the page says so instead of hiding it. 34/34 unit tests pass.
- UI redesign per the enhancement list: Tajawal font; 10–14px radii; shadow-based cards on a #F8FAFC background; roomy 8pt-grid tables; chevron selects; status chips; colour-coded icon actions with tooltips (also the accessible name); unified toolbar with search icon and primary actions; header with avatar, name, role, presence dot and a menu; refined sidebar with hover/active states. Implemented as a global design layer plus shared `Badge`/`IconButton`/`SearchBox`/`Toolbar` components, applied to the shell, dashboard, Employees and Licenses pages. Remaining pages (Companies, Verifications, Audit, Notifications) inherit the global card/table/input/spacing styles but still use plain-text status and action buttons.
- Verified in a real browser session (signed in as the demo System Administrator): dashboard with live data, charts and branch table; Employees page. Not checked: other roles, mobile widths, dark mode (none exists), the Companies/Verifications/Audit/Notifications pages after the redesign.

## Milestone: user and role administration — 23 October 2026

- Added `/users` («المستخدمون والصلاحيات», administrators only): invite users, assign/remove company roles, grant/revoke branch access, deactivate/reactivate with a reason. Added `/set-password` (invite and reset landing page with a password policy) and «نسيت كلمة المرور؟» on the sign-in page (neutral message that does not reveal whether an address exists).
- Server routes `POST /api/admin/users/{list,create,active}` verify the caller's session and administrator role before creating the service-role client; they are POST-only so Cache Components never prerenders them. Verified against the running production build: no token → 401, forged token → 401, `GET` → 405. Not verified: the authenticated success paths, the 403 for a signed-in non-administrator, and real invite links (need an administrator session and Supabase redirect configuration).
- Added migration `202610230013_user_administration.sql` (**NOT yet applied**): `assign_company_role`, `remove_company_role`, `set_user_active`, `assign_branch_access`, `remove_branch_access` (all audited; admin-of-the-company only; no self-modification; last-administrator protection).
- Unit tests: 38/38 (input schemas, redirect-origin allow-listing, password policy). `tsc`, `lint` and `build` pass.
- Documented the secure first-administrator procedure in `docs/deployment.md`.

## Milestone: audit names + CSV import/export — 23 October 2026

- Audit log details now resolve record ids to names (branches, employees, licenses, contracts, obligations, corrective actions, companies, users) with a short-id fallback and a visible warning if a lookup fails.
- Added `/import` («استيراد البيانات», managers/administrators): CSV import for licenses and employees with file validation (CSV only, 2 MB, 1,000 rows), automatic + manual column mapping (Arabic/English headers), row-level validation, duplicate detection (inside the file and against existing data), a preview, an explicit confirmation checkbox, a results summary and an import history with skipped-row reasons. Template download included. Excel files must be saved as CSV UTF-8 (no spreadsheet-parsing library was added; this is a known limitation).
- Added CSV export on Licenses, Employees, Contracts and Audit Log. Exports contain only what the page shows (already limited by RLS), neutralise spreadsheet formulas, include a BOM for Arabic in Excel, and are recorded in the audit log *before* the file is produced.
- Added migration `202610230014_import_and_export.sql` (**NOT yet applied**): import job columns, read policies for managers, `import_licenses` / `import_employees` (re-validate every row, never overwrite, single transaction, error rows stored with `invalid`/`duplicate` kind, audited) and `log_export`.
- Unit tests 49/49 (CSV round-trip, formula neutralisation, delimiter detection, date parsing, mapping, validation, duplicates, audit names). `tsc`, `lint` and `build` pass; routes return 200. Not verified: the import/export flows with a real file in a browser, and the SQL functions against the live database (migrations 007–014 must be applied in order).

## Milestone: file attachments — 23 October 2026

- Added attachments for licenses, contracts, resignation/termination processes, government-platform verifications, inspection results and corrective actions: a paperclip action on each row opens a dialog (list, upload, download, remove-with-reason). Files are stored in a **private** `attachments` bucket with **no** client storage policies (deny by default); only the server touches storage, and only after a database function authorizes the caller.
- Upload (`POST /api/attachments/upload`): authorize in the database → validate extension, size (≤10 MB) **and the real file bytes** (PDF/PNG/JPEG signatures, OOXML ZIP structure for docx/xlsx, UTF-8 text for csv; the browser-declared type is ignored) → store under an id-only path (user-supplied names never reach the path) → register metadata (rolled back from storage on failure). Download (`POST /api/attachments/url`): the database function authorizes and writes `attachment_accessed` to the audit log; the server signs a 60-second link that forces download. Removal is a soft delete with a mandatory reason; the file is retained.
- Authorization follows the record: employee-related attachments need employee-data access; approved inspection results and resolved corrective actions are closed to new evidence; branch scope is respected.
- Added migration `202610230015_attachments.sql` (**NOT yet applied**; it also creates the bucket via `storage.buckets`).
- Tests: 54/54 (adds content-sniffing, spoofed-extension, double-extension, empty/oversized, non-UTF-8 csv and bidi-filename cases). Verified against the running build: both routes return 401 without or with a forged token, and GET is refused. Not verified: an end-to-end upload/download with a real session, the storage bucket behaviour, and the SQL against the live database (migrations 007–015 in order).
- Known limits: no antivirus scanning (documented gap; add a scanner before accepting files from untrusted parties); file contents are not previewed in-browser by design; inspection submission still accepts a written evidence reference, and attachments are added afterward to the recorded result.

## Prototype: guided tour on the main page — 23 October 2026

- Added an Arabic, RTL "جولة تعريفية" tour to the main page (`/`) only: floating button (bottom-right), 14 steps, spotlight, avatar beside the card pointing at the target, counter, progress bar, Back/Next/Finish, Esc/arrow keys, focus handling, reduced-motion support, phone bottom-sheet layout. Steps whose target is absent (e.g. charts before a cycle exists) are skipped.
- Avatar: `avatar/1.png`, `2.png`, `3.png` (already transparent) were split by `scripts/split-avatar-sheets.mjs` into 18 poses in `public/avatar/`. Source resolution is ~200 px per pose, so the avatar is soft on high-DPI screens; higher-resolution sheets would fix this.
- Placement/pose rules live in `src/lib/tour-layout.ts` (unit-tested; 60/60 tests). Verified in a real browser: welcome, page title, sidebar, notifications, trend chart, tall tasks table (docked, clipped spotlight), close with Esc and relaunch, and a 390 px-wide frame (docked sheet, small avatar). Not verified: every one of the 14 steps individually on every viewport, screen readers, other roles' views (steps adapt to what is on the page).

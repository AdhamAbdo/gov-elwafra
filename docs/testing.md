# Testing

| Command | What it runs |
|---|---|
| `npm run lint` / `npx tsc --noEmit` | static checks |
| `npm run test` | unit tests (Vitest, `tests/`): business rules and workflow logic, no network |
| `npm run e2e` | end-to-end journeys in a real browser, **read-only** (safe to repeat) |
| `npm run e2e:full` | the same plus the `@mutating` journeys, which **write** small `[E2E] ...` records |
| `npm run e2e:report` | opens the HTML report of the last run |

## End-to-end suite (`e2e/`, Playwright + Chromium)

The suite drives the real app against the Supabase project in `.env.local`. It signs in as four demo roles read from
`docs/demo-accounts.txt` (system administrator, and the Bakery company's manager, compliance officer and read-only user);
credentials are never copied into the tests. A `setup` project signs each role in once and stores the session in
`e2e/.auth/` (git-ignored: it holds live tokens).

First time on a machine: `npx playwright install chromium`. The app must be running (`npm run dev`); if it is not,
Playwright starts it. Set `E2E_BASE_URL` to test a deployed copy instead.

| Spec | Covers |
|---|---|
| `01-auth` | anonymous visitors see only the login form, wrong password, forgot-password (neutral answer), sign-in/out, invalid set-password link |
| `02-navigation-permissions` | sidebar and header per role, every link opens, role-gated buttons (viewer / manager / admin) |
| `03-api-security` | every `/api` route refuses a caller with no or a forged session; manager cannot use admin endpoints or change another company's logo |
| `04-dashboard` | 10 KPI cards, nine filters + reset, company scope per role, charts, work-list tables, refresh |
| `05-companies` | company cards and stat tiles, add-company/department forms, logo validation, per-role controls |
| `06-licenses` | register, search, add form + date validation, CSV export, attachments dialog, read-only role |
| `07-employees` | employee / contract / resignation tables, search, add form, export, read-only role |
| `08-verifications` | platform matrix, log, filters, required-field validation, read-only role |
| `09-notifications` | bell, list/empty state, unread controls, admin thresholds |
| `10-users` | user list, search, self-protection, invite and role-management panels, non-admin access |
| `11-audit-import` | audit table and filters, CSV template download, CSV mapping + preview (never confirmed) |
| `12-profile` | profile details, password policy and current-password check, avatar validation |
| `13-ui-behaviour` | RTL, loading skeletons, dark table title bars, search-box spacing, guided tour, no sideways scroll on phones |

### Mutating journeys (`@mutating`, only with `npm run e2e:full`)

These create real records in the connected database, named `[E2E] ...` so they are easy to find:
an obligation, a department (created, rejected as a duplicate, renamed, deactivated), a license, an employee and a
platform verification. The display-name change is restored at the end and the profile picture is removed again.
Nothing is hard-deleted by the app, so these records stay (departments are left deactivated). Run them against a
disposable or demo project, not production.

### Notes

* Some journeys skip themselves with a reason when the data they need is absent (for example no inspection cycle for the
  current week: run `npm run scheduler`).
* Supabase sign-out is global (it revokes every session of that user). The sign-out test therefore uses
  `viewer@sawafi.local`, which no other spec signs in with. Do not change it to a role used by the saved sessions.
* The first visit to each page in `next dev` compiles it and can take many seconds; if a cold run times out, run it again.
* Database/RLS integration tests still need a disposable Supabase test project and are not part of this suite.

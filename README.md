# Governance & Compliance Management System

Enterprise Arabic RTL foundation for company-scoped compliance operations. It does not fabricate production records, portal integrations, or compliance outcomes.

## Local start

1. Copy `.env.example` to `.env.local` and set Supabase values.
2. Apply `supabase/migrations/202610190001_initial_schema.sql` to a non-production Supabase project.
3. `npm install`
4. `npm run dev`

Validate with `npm run lint`, `npm run test`, and `npm run build`.

See `docs/` for architecture, business rules, permissions, schema, schedules, deployment, testing, and QA status.

## Optional demo data

After applying both migrations and creating the first administrator, manually run `supabase/seed/demo_scenario.sql` in Supabase SQL Editor. It creates clearly labeled `[DEMO]` data only; it is not part of the production migration path.

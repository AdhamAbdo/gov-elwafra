# Demo scenario

Run `demo_scenario.sql` manually in the Supabase SQL Editor after the two migrations. It is repeat-safe for its fixed identifiers and creates only records prefixed `[DEMO]`.

It requires exactly one active `System Administrator` profile. The seed is deliberately separate from migrations: never run demo data automatically against production.

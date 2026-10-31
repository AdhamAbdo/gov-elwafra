# Architecture

Next.js App Router is the RTL presentation and server boundary. Supabase Auth authenticates users; PostgreSQL is the system of record. Browser clients use the anon key only. Server-side workflows validate Zod inputs and determine the authenticated subject.

Scheduler jobs create Sunday–Saturday (`Asia/Riyadh`) cycles and use database unique keys for retries. Email is an adapter: an attempt is never a delivery confirmation.

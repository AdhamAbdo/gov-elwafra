# Deployment

Create a Supabase project, apply `supabase/migrations`, configure private Storage, and add the `.env.example` variables in the host secret manager. Create the first Auth user through protected admin tooling, then insert its profile and administrator company role through a controlled migration/RPC—never a public registration endpoint.

## Creating the first administrator, and users after that

There is deliberately no public sign-up and no endpoint that lets anyone promote themselves.

1. **First administrator (one time, by someone with Supabase dashboard access):** create the user in *Authentication > Users*, then run once in the SQL Editor, replacing the placeholders: `insert into public.user_profiles(id, display_name, active) values ('<AUTH_USER_UUID>', '<name>', true);` followed by `insert into public.user_company_roles(user_id, company_id, role) select '<AUTH_USER_UUID>', id, 'system_administrator' from public.companies;`. Use a strong unique password; never reuse the demo passwords.
2. **Every later user:** a system administrator opens **المستخدمون والصلاحيات** and invites them. The server (`/api/admin/users/*`) verifies the caller's own session and the `system_administrator` role in the database before it uses the service-role key, which exists only in the server environment (`SUPABASE_SERVICE_ROLE_KEY`, never `NEXT_PUBLIC_*`). The invited person receives a one-time link and chooses their own password on `/set-password`; no password is generated, stored or shown by the app.
3. **Required Supabase configuration:** set `APP_URL` to the deployed URL, and add `<APP_URL>/set-password` to *Authentication > URL Configuration > Redirect URLs*. "Forgot password" on the sign-in page uses Supabase's reset email and therefore needs working Auth email (the built-in sender is heavily rate-limited; configure custom SMTP for production). Also enable leaked-password protection under *Authentication > Providers > Email*.
4. **Guard rails enforced in the database:** an administrator cannot change their own roles or active flag, and the last active system administrator of a company cannot be removed or deactivated. Deactivation blocks both database access and sign-in; history is retained.

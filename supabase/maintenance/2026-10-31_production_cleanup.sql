-- One-off production cleanup (NOT a migration; run once by hand in the Supabase SQL Editor).
-- Removes demo/test data and demo accounts. Keeps: the 3 "- " companies, system admin "ali",
-- one manager per company (*.local) and one compliance officer (compliance@alwafra.local) for all three.
-- audit_logs and platform_verifications are append-only (row triggers), so they are emptied with TRUNCATE,
-- which does not fire row triggers. Everything runs in one transaction: any error rolls it all back.
-- A backup of every table was taken first: backups/pre-production-cleanup-2026-10-31/

begin;

-- Safety: abort unless the records we intend to keep really exist.
do $$ begin
  if (select count(*) from public.companies where id in ('67a8c208-3c2d-42da-8705-043d64f8b490','73332e0f-7699-40da-a58b-5a2175c6d76c','7ad5f936-e4b0-48a9-9b2e-4f213cd0574e')) <> 3
     or (select count(*) from public.user_profiles where id in ('7551aea2-5b3d-44b5-bb05-f6ddde17fb56','83dbaf57-42e9-47d9-9118-344bbb5d52e7','407a5a8c-bba4-452d-a755-17bd2652e6cf','8cb54339-48a4-4739-8bc4-51de555e2843','1ede8c8a-63d8-48e1-85b4-98342e57c4c3')) <> 5
  then raise exception 'kept companies/users not found - aborting'; end if;
end $$;

-- 1. All operational / demo data.
truncate table
  public.audit_logs, public.platform_verifications, public.notification_delivery_attempts, public.notifications,
  public.attachments, public.import_errors, public.import_jobs, public.scheduler_runs,
  public.review_decisions, public.corrective_actions, public.compliance_checks, public.inspection_tasks,
  public.compliance_items, public.licenses, public.employee_events, public.contracts, public.employees;

-- 2. Departments (demo) and the duplicate companies without the "- " prefix.
delete from public.user_branch_access;
delete from public.branches;
delete from public.user_company_roles;
delete from public.notification_preferences;
delete from public.companies where id in ('e58b0002-7681-4d8f-aa7d-3e0ef07af5b5','154422c2-221b-4c10-a71e-2c07a8c0bb27','c3bf2161-23fe-48ae-87c3-2579410ea1a4');

-- 3. Roles: exactly 1 admin, 3 managers, 1 compliance officer (on all three companies).
insert into public.user_company_roles(user_id, company_id, role) values
  ('7551aea2-5b3d-44b5-bb05-f6ddde17fb56','67a8c208-3c2d-42da-8705-043d64f8b490','system_administrator'),
  ('7551aea2-5b3d-44b5-bb05-f6ddde17fb56','73332e0f-7699-40da-a58b-5a2175c6d76c','system_administrator'),
  ('7551aea2-5b3d-44b5-bb05-f6ddde17fb56','7ad5f936-e4b0-48a9-9b2e-4f213cd0574e','system_administrator'),
  ('83dbaf57-42e9-47d9-9118-344bbb5d52e7','67a8c208-3c2d-42da-8705-043d64f8b490','company_manager'),
  ('407a5a8c-bba4-452d-a755-17bd2652e6cf','73332e0f-7699-40da-a58b-5a2175c6d76c','company_manager'),
  ('8cb54339-48a4-4739-8bc4-51de555e2843','7ad5f936-e4b0-48a9-9b2e-4f213cd0574e','company_manager'),
  ('1ede8c8a-63d8-48e1-85b4-98342e57c4c3','67a8c208-3c2d-42da-8705-043d64f8b490','compliance_officer'),
  ('1ede8c8a-63d8-48e1-85b4-98342e57c4c3','73332e0f-7699-40da-a58b-5a2175c6d76c','compliance_officer'),
  ('1ede8c8a-63d8-48e1-85b4-98342e57c4c3','7ad5f936-e4b0-48a9-9b2e-4f213cd0574e','compliance_officer');

-- 4. Accounts. Pure demo accounts (viewers, extra compliance officers) are deleted;
--    real-looking accounts (adhamabdo898@gmail.com, tharwat, ثروت, admin@admin.sa) lose all access and are deactivated (reversible).
update public.notification_settings set updated_by = null;
update public.user_profiles set active = false where id in (
  'c5519afd-c5a3-4537-aeb2-182c06870fab','cdd7ff46-e05d-4374-af15-786ca086efef','694426c8-f717-404e-a54d-f9912f767956','93dbcd84-1842-432c-8489-0df13ebd65c9');
delete from public.user_profiles where id in (
  '055ae113-21ee-474d-9ccf-cedd412a254f','ad98ced4-4e74-4fdc-ae30-1be2d90a24c7','51b9789b-aba5-4d76-9f18-800e95fa428a',
  'e1113a8c-b09b-43a0-8292-e50802890a5f','79e2bd60-ef6e-4fb4-8468-5a9d0d46a4ba');

-- 5. Record the cleanup itself.
insert into public.audit_logs(actor_id, action, entity_type, after_value)
values (null, 'production_cleanup', 'system', jsonb_build_object('note', 'demo data removed before go-live'));

-- Result check: expect 3 companies, 9 roles, 0 in every data table.
select (select count(*) from public.companies) as companies, (select count(*) from public.user_company_roles) as roles,
       (select count(*) from public.user_profiles) as profiles, (select count(*) from public.licenses) as licenses,
       (select count(*) from public.employees) as employees, (select count(*) from public.audit_logs) as audit_logs;

commit;

-- Manual government-platform verification records (Qiwa, GOSI, Mudad, Nitaqat, Balady, SFDA, Civil Defense).
-- Records are append-only: a correction is a new record. Nothing here claims a live integration;
-- every row is a person's manual observation. Nitaqat stores the OFFICIALLY OBSERVED classification and figures only.

create table public.platform_verifications (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('qiwa','gosi','mudad','nitaqat','balady','sfda','civil_defense')),
  company_id uuid not null references public.companies(id),
  branch_id uuid references public.branches(id),
  employee_id uuid references public.employees(id),
  wage_period text check (wage_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),           -- the period the wages cover (Mudad)
  verified_at timestamptz not null default now(),                               -- when the portal was checked
  verified_by uuid not null references public.user_profiles(id),
  next_deadline date,                                                           -- next operational deadline (distinct from period and check time)
  outcome text not null check (outcome in ('no_issue','issue_found','unable_to_verify')),
  observed_status text not null check (btrim(observed_status) <> ''),         -- what the portal displayed
  notes text,
  evidence_reference text,
  follow_up_action text,
  follow_up_due date,
  follow_up_closed_at timestamptz,
  follow_up_closed_by uuid references public.user_profiles(id),
  nitaqat_classification text,
  nitaqat_total_employees integer check (nitaqat_total_employees >= 0),
  nitaqat_saudi_employees integer check (nitaqat_saudi_employees >= 0),
  created_at timestamptz not null default now(),
  check (wage_period is null or platform = 'mudad'),
  check (platform = 'nitaqat' or (nitaqat_classification is null and nitaqat_total_employees is null and nitaqat_saudi_employees is null)),
  check (platform <> 'nitaqat' or outcome = 'unable_to_verify' or (nitaqat_classification is not null and btrim(nitaqat_classification) <> '' and nitaqat_total_employees is not null and nitaqat_saudi_employees is not null)),
  check (nitaqat_saudi_employees is null or nitaqat_saudi_employees <= nitaqat_total_employees),
  check (outcome <> 'issue_found' or (notes is not null and follow_up_action is not null)),
  check (follow_up_closed_at is null or follow_up_action is not null)
);
alter table public.platform_verifications enable row level security;
create index platform_verifications_scope_idx on public.platform_verifications(company_id, platform, verified_at desc);
create index platform_verifications_followup_idx on public.platform_verifications(follow_up_due) where follow_up_action is not null and follow_up_closed_at is null;
create trigger platform_verifications_branch_matches_company before insert or update of company_id,branch_id on public.platform_verifications for each row execute function public.validate_company_branch();

create policy platform_verification_read on public.platform_verifications for select
  using (branch_id is null and public.can_access_company(company_id) or branch_id is not null and public.can_access_branch(company_id, branch_id));

create or replace function public.record_platform_verification(
  platform_name text, target_company uuid, target_branch uuid, target_employee uuid, period text, checked_at timestamptz,
  deadline date, result text, observed text, note_text text, evidence text, follow_up text, follow_up_by date,
  nitaqat_class text default null, nitaqat_total integer default null, nitaqat_saudi integer default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if not public.has_company_role(target_company, array['compliance_officer','company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if target_branch is null then
    if not public.can_access_company(target_company) then raise exception 'not authorized'; end if;
  elsif not public.can_access_branch(target_company, target_branch) then raise exception 'not authorized for branch'; end if;
  if target_employee is not null and not exists(select 1 from public.employees e where e.id=target_employee and e.company_id=target_company and public.can_view_employee_data(e.company_id, e.branch_id)) then raise exception 'employee must belong to the company and be accessible'; end if;
  if checked_at is null or checked_at > now() + interval '5 minutes' then raise exception 'verification time cannot be empty or in the future'; end if;
  insert into public.platform_verifications(platform,company_id,branch_id,employee_id,wage_period,verified_at,verified_by,next_deadline,outcome,observed_status,notes,evidence_reference,follow_up_action,follow_up_due,nitaqat_classification,nitaqat_total_employees,nitaqat_saudi_employees)
  values(platform_name,target_company,target_branch,target_employee,nullif(btrim(period),''),checked_at,auth.uid(),deadline,result,btrim(observed),nullif(btrim(note_text),''),nullif(btrim(evidence),''),nullif(btrim(follow_up),''),follow_up_by,nullif(btrim(nitaqat_class),''),nitaqat_total,nitaqat_saudi)
  returning id into new_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'platform_verification_recorded','platform_verification',new_id,target_company,jsonb_build_object('platform',platform_name,'outcome',result,'branch_id',target_branch));
  return new_id;
end $$;

create or replace function public.close_verification_follow_up(verification_id uuid, closing_note text) returns void
language plpgsql security definer set search_path=public as $$
declare v public.platform_verifications;
begin
  select * into v from public.platform_verifications where id=verification_id for update;
  if v.id is null then raise exception 'verification not found'; end if;
  if v.follow_up_action is null then raise exception 'this record has no follow-up action'; end if;
  if v.follow_up_closed_at is not null then raise exception 'follow-up already closed'; end if;
  if not public.has_company_role(v.company_id, array['compliance_officer','company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if v.branch_id is null then
    if not public.can_access_company(v.company_id) then raise exception 'not authorized'; end if;
  elsif not public.can_access_branch(v.company_id, v.branch_id) then raise exception 'not authorized for branch'; end if;
  if coalesce(nullif(btrim(closing_note),''),'')='' then raise exception 'a closing note is required'; end if;
  update public.platform_verifications set follow_up_closed_at=now(), follow_up_closed_by=auth.uid() where id=verification_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'platform_follow_up_closed','platform_verification',verification_id,v.company_id,jsonb_build_object('note',btrim(closing_note)));
end $$;

-- Verification content is immutable; only the follow-up closure fields (set by the RPC above) may change.
create or replace function public.guard_platform_verification() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'verification records cannot be deleted'; end if;
  if (to_jsonb(new) - 'follow_up_closed_at' - 'follow_up_closed_by') is distinct from (to_jsonb(old) - 'follow_up_closed_at' - 'follow_up_closed_by') then raise exception 'verification records are immutable; record a new verification instead'; end if;
  return new;
end $$;
create trigger platform_verifications_immutable before update or delete on public.platform_verifications for each row execute function public.guard_platform_verification();

revoke all on function public.record_platform_verification(text,uuid,uuid,uuid,text,timestamptz,date,text,text,text,text,text,date,text,integer,integer), public.close_verification_follow_up(uuid,text) from public, anon;
grant execute on function public.record_platform_verification(text,uuid,uuid,uuid,text,timestamptz,date,text,text,text,text,text,date,text,integer,integer), public.close_verification_follow_up(uuid,text) to authenticated;

-- Audit log: append-only for everyone, including privileged connections.
create or replace function public.guard_audit_log() returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only'; end $$;
create trigger audit_logs_append_only before update or delete on public.audit_logs for each row execute function public.guard_audit_log();

-- Managers may see the display names of users in their companies (needed to show who acted in the audit log).
-- A security-definer helper is required: a subquery on user_company_roles inside the policy would itself be filtered by RLS.
create or replace function public.can_see_profile(target uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select target = auth.uid() or exists(
    select 1 from public.user_company_roles r
    where r.user_id = target and public.has_company_role(r.company_id, array['company_manager','general_manager','system_administrator']::app_role[]))
$$;
revoke all on function public.can_see_profile(uuid) from public, anon;
grant execute on function public.can_see_profile(uuid) to authenticated;
create policy profile_read_company on public.user_profiles for select using (public.can_see_profile(id));

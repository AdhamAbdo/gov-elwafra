-- Employees, contracts, resignation/termination events.
-- Employee data is sensitive: read-only users get no access. Writes go through audited RPCs only.
-- A submitted resignation/termination does NOT change employment_status; only complete_employee_event does.

alter table public.employees add constraint employees_status_check check (employment_status in ('active','on_leave','resigned','terminated','inactive'));
alter table public.contracts
  add column if not exists notes text,
  add constraint contracts_status_check check (status in ('active','renewed','expired','terminated')),
  add constraint contracts_verification_check check (verification_status in ('not_verified','verified','discrepancy')),
  add constraint contracts_dates_check check (ends_at is null or ends_at > starts_at);
alter table public.employee_events
  add column if not exists notice_date date,
  add column if not exists follow_up text,
  add column if not exists notes text,
  add column if not exists completed_by uuid references public.user_profiles(id),
  add constraint employee_events_status_check check (process_status in ('submitted','under_review','notice_period','completed','withdrawn','rejected')),
  add constraint employee_events_completion_check check ((process_status = 'completed') = (actual_effective_at is not null));
create index if not exists employees_company_branch_idx on public.employees(company_id, branch_id);
create index if not exists contracts_employee_idx on public.contracts(employee_id);
create index if not exists contracts_ends_at_idx on public.contracts(ends_at) where status = 'active';
create index if not exists employee_events_employee_idx on public.employee_events(employee_id);
create unique index if not exists contracts_one_renewal_per_contract on public.contracts(renewed_from) where renewed_from is not null;

create or replace function public.can_view_employee_data(target_company uuid, target_branch uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.has_company_role(target_company, array['compliance_officer','company_manager','general_manager','system_administrator']::app_role[])
     and (case when target_branch is null then public.can_access_company(target_company) else public.can_access_branch(target_company, target_branch) end)
$$;

create or replace function public.can_view_employee(emp uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.employees e where e.id = emp and public.can_view_employee_data(e.company_id, e.branch_id))
$$;

drop policy if exists employee_read on public.employees;
create policy employee_read on public.employees for select using (public.can_view_employee_data(company_id, branch_id));
create policy contract_read on public.contracts for select using (public.can_view_employee(employee_id));
create policy employee_event_read on public.employee_events for select using (public.can_view_employee(employee_id));

create or replace function public.create_employee(target_company uuid, target_branch uuid, code text, full_name_text text, title text, started date, owner uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if not public.has_company_role(target_company, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if coalesce(nullif(btrim(code),''),'')='' or coalesce(nullif(btrim(full_name_text),''),'')='' then raise exception 'employee code and name are required'; end if;
  if target_branch is not null and not exists(select 1 from public.branches where id=target_branch and company_id=target_company and active) then raise exception 'branch must be active and belong to company'; end if;
  if owner is not null and not exists(select 1 from public.user_company_roles where user_id=owner and company_id=target_company and role <> 'read_only') then raise exception 'owner must be a non-read-only company user'; end if;
  insert into public.employees(employee_code,company_id,branch_id,full_name,job_title,employment_status,start_date,owner_id)
  values(btrim(code),target_company,target_branch,btrim(full_name_text),nullif(btrim(title),''),'active',started,owner) returning id into new_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'employee_created','employee',new_id,target_company,jsonb_build_object('employee_code',btrim(code),'branch_id',target_branch));
  return new_id;
end $$;

create or replace function public.create_contract(emp uuid, identifier text, starts timestamptz, ends timestamptz, note_text text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare e public.employees; new_id uuid;
begin
  select * into e from public.employees where id=emp;
  if e.id is null then raise exception 'employee not found'; end if;
  if not public.has_company_role(e.company_id, array['company_manager','general_manager','system_administrator']::app_role[]) or not public.can_view_employee_data(e.company_id, e.branch_id) then raise exception 'not authorized'; end if;
  if coalesce(nullif(btrim(identifier),''),'')='' then raise exception 'contract identifier is required'; end if;
  if ends is not null and ends <= starts then raise exception 'contract end must be after its start'; end if;
  insert into public.contracts(employee_id,contract_identifier,starts_at,ends_at,status,notes) values(emp,btrim(identifier),starts,ends,'active',nullif(btrim(note_text),'')) returning id into new_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'contract_created','contract',new_id,e.company_id,jsonb_build_object('employee_id',emp,'ends_at',ends));
  return new_id;
end $$;

create or replace function public.verify_contract(contract_id uuid, outcome text, note_text text default null) returns void
language plpgsql security definer set search_path=public as $$
declare c public.contracts; e public.employees;
begin
  if outcome not in ('verified','discrepancy') then raise exception 'invalid verification outcome'; end if;
  select * into c from public.contracts where id=contract_id for update;
  if c.id is null then raise exception 'contract not found'; end if;
  select * into e from public.employees where id=c.employee_id;
  if not public.can_view_employee_data(e.company_id, e.branch_id) then raise exception 'not authorized'; end if;
  if outcome='discrepancy' and coalesce(nullif(btrim(note_text),''),'')='' then raise exception 'a note is required when a discrepancy is found'; end if;
  update public.contracts set verification_status=outcome, last_verified_at=now(), notes=coalesce(nullif(btrim(note_text),''), notes) where id=contract_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,before_value,after_value)
  values(auth.uid(),'contract_verified','contract',contract_id,e.company_id,jsonb_build_object('verification_status',c.verification_status),jsonb_build_object('verification_status',outcome,'note',nullif(btrim(note_text),'')));
end $$;

-- A renewal/extension is a NEW linked contract; the old one is kept with status 'renewed'.
create or replace function public.renew_contract(old_contract_id uuid, identifier text, starts timestamptz, ends timestamptz) returns uuid
language plpgsql security definer set search_path=public as $$
declare c public.contracts; e public.employees; new_id uuid;
begin
  select * into c from public.contracts where id=old_contract_id for update;
  if c.id is null then raise exception 'contract not found'; end if;
  select * into e from public.employees where id=c.employee_id;
  if not public.has_company_role(e.company_id, array['company_manager','general_manager','system_administrator']::app_role[]) or not public.can_view_employee_data(e.company_id, e.branch_id) then raise exception 'not authorized'; end if;
  if c.status <> 'active' then raise exception 'only an active contract can be renewed'; end if;
  if coalesce(nullif(btrim(identifier),''),'')='' then raise exception 'contract identifier is required'; end if;
  if ends is null or ends <= starts then raise exception 'renewed contract end must be after its start'; end if;
  if c.ends_at is not null and ends <= c.ends_at then raise exception 'the renewed contract must end after the previous one'; end if;
  insert into public.contracts(employee_id,contract_identifier,starts_at,ends_at,status,renewed_from) values(c.employee_id,btrim(identifier),starts,ends,'active',c.id) returning id into new_id;
  update public.contracts set status='renewed' where id=c.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,before_value,after_value)
  values(auth.uid(),'contract_renewed','contract',new_id,e.company_id,jsonb_build_object('previous_contract_id',c.id,'previous_ends_at',c.ends_at),jsonb_build_object('ends_at',ends));
  return new_id;
end $$;

create or replace function public.record_employee_event(emp uuid, kind text, submitted timestamptz, notice date, expected timestamptz, responsible uuid, note_text text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare e public.employees; new_id uuid;
begin
  select * into e from public.employees where id=emp;
  if e.id is null or not public.can_view_employee_data(e.company_id, e.branch_id) then raise exception 'not authorized'; end if;
  if kind not in ('resignation','termination') then raise exception 'invalid event type'; end if;
  if e.employment_status in ('resigned','terminated','inactive') then raise exception 'employee is no longer active'; end if;
  if exists(select 1 from public.employee_events where employee_id=emp and process_status in ('submitted','under_review','notice_period')) then raise exception 'an open resignation/termination process already exists for this employee'; end if;
  if responsible is not null and not exists(select 1 from public.user_company_roles where user_id=responsible and company_id=e.company_id and role <> 'read_only') then raise exception 'responsible person must be a non-read-only company user'; end if;
  insert into public.employee_events(employee_id,event_type,submitted_at,notice_date,expected_effective_at,process_status,responsible_id,notes)
  values(emp,kind,submitted,notice,expected,'submitted',responsible,nullif(btrim(note_text),'')) returning id into new_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'employee_event_recorded','employee_event',new_id,e.company_id,jsonb_build_object('employee_id',emp,'type',kind));
  return new_id;
end $$;

create or replace function public.update_employee_event(event_id uuid, new_status text, follow_up_text text default null, note_text text default null) returns void
language plpgsql security definer set search_path=public as $$
declare ev public.employee_events; e public.employees;
begin
  if new_status not in ('under_review','notice_period','withdrawn','rejected') then raise exception 'use complete_employee_event to complete a process'; end if;
  select * into ev from public.employee_events where id=event_id for update;
  if ev.id is null then raise exception 'event not found'; end if;
  select * into e from public.employees where id=ev.employee_id;
  if not public.can_view_employee_data(e.company_id, e.branch_id) then raise exception 'not authorized'; end if;
  if ev.process_status in ('completed','withdrawn','rejected') then raise exception 'this process is already closed'; end if;
  update public.employee_events set process_status=new_status, follow_up=coalesce(nullif(btrim(follow_up_text),''),follow_up), notes=coalesce(nullif(btrim(note_text),''),notes) where id=event_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,before_value,after_value)
  values(auth.uid(),'employee_event_updated','employee_event',event_id,e.company_id,jsonb_build_object('process_status',ev.process_status),jsonb_build_object('process_status',new_status));
end $$;

-- Only here does employment actually end, and only with an authorised user's recorded effective date.
create or replace function public.complete_employee_event(event_id uuid, effective timestamptz) returns void
language plpgsql security definer set search_path=public as $$
declare ev public.employee_events; e public.employees;
begin
  select * into ev from public.employee_events where id=event_id for update;
  if ev.id is null then raise exception 'event not found'; end if;
  select * into e from public.employees where id=ev.employee_id for update;
  if not public.has_company_role(e.company_id, array['company_manager','general_manager','system_administrator']::app_role[]) or not public.can_view_employee_data(e.company_id, e.branch_id) then raise exception 'not authorized'; end if;
  if ev.process_status in ('completed','withdrawn','rejected') then raise exception 'this process is already closed'; end if;
  if effective is null or effective > now() then raise exception 'the actual effective date cannot be empty or in the future'; end if;
  update public.employee_events set process_status='completed', actual_effective_at=effective, completed_by=auth.uid() where id=event_id;
  update public.employees set employment_status=case ev.event_type when 'resignation' then 'resigned' else 'terminated' end where id=e.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,before_value,after_value)
  values(auth.uid(),'employee_event_completed','employee_event',event_id,e.company_id,jsonb_build_object('employment_status',e.employment_status),jsonb_build_object('actual_effective_at',effective));
end $$;

revoke all on function public.create_employee(uuid,uuid,text,text,text,date,uuid), public.create_contract(uuid,text,timestamptz,timestamptz,text), public.verify_contract(uuid,text,text), public.renew_contract(uuid,text,timestamptz,timestamptz), public.record_employee_event(uuid,text,timestamptz,date,timestamptz,uuid,text), public.update_employee_event(uuid,text,text,text), public.complete_employee_event(uuid,timestamptz) from public, anon;
grant execute on function public.create_employee(uuid,uuid,text,text,text,date,uuid), public.create_contract(uuid,text,timestamptz,timestamptz,text), public.verify_contract(uuid,text,text), public.renew_contract(uuid,text,timestamptz,timestamptz), public.record_employee_event(uuid,text,timestamptz,date,timestamptz,uuid,text), public.update_employee_event(uuid,text,text,text), public.complete_employee_event(uuid,timestamptz) to authenticated;

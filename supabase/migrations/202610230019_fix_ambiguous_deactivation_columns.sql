-- Fixes "column reference ... is ambiguous" when deactivating a department or a company.
-- In set_branch_active / set_company_active a parameter shares its name with a table column (branch_id / company_id),
-- so the unqualified column on the left of the comparison matched both. The columns are now table-qualified.
-- Behaviour and authorization are unchanged.

create or replace function public.set_company_active(company_id uuid, make_active boolean, reason text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.has_company_role(company_id, array['system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.companies where id=company_id) then raise exception 'company not found'; end if;
  if not make_active then
    if coalesce(nullif(btrim(reason),''),'')='' then raise exception 'a reason is required to deactivate a company'; end if;
    if exists(select 1 from public.branches where branches.company_id=set_company_active.company_id and branches.active) then raise exception 'deactivate the company''s active branches first'; end if;
  end if;
  update public.companies set active=make_active, updated_at=now() where id=company_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),case when make_active then 'company_activated' else 'company_deactivated' end,'company',company_id,company_id,jsonb_build_object('reason',nullif(btrim(reason),'')));
end $$;

create or replace function public.set_branch_active(branch_id uuid, make_active boolean, reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare b public.branches;
begin
  select * into b from public.branches where id=branch_id for update;
  if b.id is null then raise exception 'branch not found'; end if;
  if not public.has_company_role(b.company_id, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if make_active and not exists(select 1 from public.companies where id=b.company_id and active) then raise exception 'the company is inactive'; end if;
  if not make_active then
    if coalesce(nullif(btrim(reason),''),'')='' then raise exception 'a reason is required to deactivate a branch'; end if;
    if exists(select 1 from public.compliance_items where compliance_items.branch_id=set_branch_active.branch_id and compliance_items.active) then raise exception 'deactivate or move the branch''s active obligations first'; end if;
    if exists(select 1 from public.employees where employees.branch_id=set_branch_active.branch_id and employees.employment_status in ('active','on_leave')) then raise exception 'reassign the branch''s active employees first'; end if;
  end if;
  update public.branches set active=make_active where id=branch_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),case when make_active then 'branch_activated' else 'branch_deactivated' end,'branch',branch_id,b.company_id,jsonb_build_object('reason',nullif(btrim(reason),'')));
end $$;

revoke all on function public.set_company_active(uuid,boolean,text), public.set_branch_active(uuid,boolean,text) from public, anon;
grant execute on function public.set_company_active(uuid,boolean,text), public.set_branch_active(uuid,boolean,text) to authenticated;

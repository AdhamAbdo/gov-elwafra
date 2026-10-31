-- Company and branch administration. Only system administrators create/deactivate companies;
-- company managers manage their own company's branches. Deactivation, never deletion.

create or replace function public.is_system_administrator() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_company_roles r join public.user_profiles p on p.id=r.user_id and p.active where r.user_id=auth.uid() and r.role='system_administrator')
$$;

-- The creator receives system_administrator on the new company, otherwise RLS would hide it from them.
create or replace function public.create_company(name_text text, legal_name_text text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if not public.is_system_administrator() then raise exception 'not authorized'; end if;
  if coalesce(nullif(btrim(name_text),''),'')='' then raise exception 'company name is required'; end if;
  if exists(select 1 from public.companies where lower(name_ar)=lower(btrim(name_text))) then raise exception 'a company with this name already exists'; end if;
  insert into public.companies(name_ar,legal_name) values(btrim(name_text),nullif(btrim(legal_name_text),'')) returning id into new_id;
  insert into public.user_company_roles(user_id,company_id,role) values(auth.uid(),new_id,'system_administrator');
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'company_created','company',new_id,new_id,jsonb_build_object('name',btrim(name_text)));
  return new_id;
end $$;

create or replace function public.update_company(company_id uuid, name_text text, legal_name_text text default null) returns void
language plpgsql security definer set search_path=public as $$
declare old public.companies;
begin
  select * into old from public.companies where id=company_id for update;
  if old.id is null then raise exception 'company not found'; end if;
  if not public.has_company_role(company_id, array['system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if coalesce(nullif(btrim(name_text),''),'')='' then raise exception 'company name is required'; end if;
  if exists(select 1 from public.companies where id<>company_id and lower(name_ar)=lower(btrim(name_text))) then raise exception 'a company with this name already exists'; end if;
  update public.companies set name_ar=btrim(name_text), legal_name=nullif(btrim(legal_name_text),''), updated_at=now() where id=company_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,before_value,after_value)
  values(auth.uid(),'company_updated','company',company_id,company_id,jsonb_build_object('name',old.name_ar,'legal_name',old.legal_name),jsonb_build_object('name',btrim(name_text),'legal_name',nullif(btrim(legal_name_text),'')));
end $$;

create or replace function public.set_company_active(company_id uuid, make_active boolean, reason text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.has_company_role(company_id, array['system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.companies where id=company_id) then raise exception 'company not found'; end if;
  if not make_active then
    if coalesce(nullif(btrim(reason),''),'')='' then raise exception 'a reason is required to deactivate a company'; end if;
    if exists(select 1 from public.branches where company_id=set_company_active.company_id and active) then raise exception 'deactivate the company''s active branches first'; end if;
  end if;
  update public.companies set active=make_active, updated_at=now() where id=company_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),case when make_active then 'company_activated' else 'company_deactivated' end,'company',company_id,company_id,jsonb_build_object('reason',nullif(btrim(reason),'')));
end $$;

create or replace function public.create_branch(target_company uuid, name_text text) returns uuid
language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if not public.has_company_role(target_company, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.companies where id=target_company and active) then raise exception 'company must exist and be active'; end if;
  if coalesce(nullif(btrim(name_text),''),'')='' then raise exception 'branch name is required'; end if;
  if exists(select 1 from public.branches where company_id=target_company and lower(name_ar)=lower(btrim(name_text))) then raise exception 'this company already has a branch with that name'; end if;
  insert into public.branches(company_id,name_ar) values(target_company,btrim(name_text)) returning id into new_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'branch_created','branch',new_id,target_company,jsonb_build_object('name',btrim(name_text)));
  return new_id;
end $$;

create or replace function public.update_branch(branch_id uuid, name_text text) returns void
language plpgsql security definer set search_path=public as $$
declare b public.branches;
begin
  select * into b from public.branches where id=branch_id for update;
  if b.id is null then raise exception 'branch not found'; end if;
  if not public.has_company_role(b.company_id, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if coalesce(nullif(btrim(name_text),''),'')='' then raise exception 'branch name is required'; end if;
  if exists(select 1 from public.branches where company_id=b.company_id and id<>branch_id and lower(name_ar)=lower(btrim(name_text))) then raise exception 'this company already has a branch with that name'; end if;
  update public.branches set name_ar=btrim(name_text) where id=branch_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,before_value,after_value)
  values(auth.uid(),'branch_updated','branch',branch_id,b.company_id,jsonb_build_object('name',b.name_ar),jsonb_build_object('name',btrim(name_text)));
end $$;

-- A branch with live obligations, employees or licenses cannot be silently orphaned.
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
    if exists(select 1 from public.compliance_items where branch_id=set_branch_active.branch_id and active) then raise exception 'deactivate or move the branch''s active obligations first'; end if;
    if exists(select 1 from public.employees where branch_id=set_branch_active.branch_id and employment_status in ('active','on_leave')) then raise exception 'reassign the branch''s active employees first'; end if;
  end if;
  update public.branches set active=make_active where id=branch_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),case when make_active then 'branch_activated' else 'branch_deactivated' end,'branch',branch_id,b.company_id,jsonb_build_object('reason',nullif(btrim(reason),'')));
end $$;

revoke all on function public.is_system_administrator(), public.create_company(text,text), public.update_company(uuid,text,text), public.set_company_active(uuid,boolean,text), public.create_branch(uuid,text), public.update_branch(uuid,text), public.set_branch_active(uuid,boolean,text) from public, anon;
grant execute on function public.is_system_administrator(), public.create_company(text,text), public.update_company(uuid,text,text), public.set_company_active(uuid,boolean,text), public.create_branch(uuid,text), public.update_branch(uuid,text), public.set_branch_active(uuid,boolean,text) to authenticated;

-- User and role administration. Every function authorizes the caller as a system_administrator OF THE
-- RELEVANT COMPANY. There is no self-service path: you can never change your own roles or active flag, and the
-- last active system administrator of a company can never be removed or deactivated.

create or replace function public.is_admin_of(target_company uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.has_company_role(target_company, array['system_administrator']::app_role[])
$$;

-- True when the caller administers at least one company the target user holds a role in.
create or replace function public.admin_shares_company(target uuid) returns uuid
language sql stable security definer set search_path=public as $$
  select r.company_id from public.user_company_roles r where r.user_id = target and public.is_admin_of(r.company_id) limit 1
$$;

create or replace function public.assign_company_role(target uuid, target_company uuid, new_role app_role) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin_of(target_company) then raise exception 'not authorized'; end if;
  if target = auth.uid() then raise exception 'you cannot change your own roles'; end if;
  if not exists(select 1 from public.user_profiles where id = target) then raise exception 'user not found'; end if;
  if not exists(select 1 from public.companies where id = target_company and active) then raise exception 'company must exist and be active'; end if;
  insert into public.user_company_roles(user_id, company_id, role) values(target, target_company, new_role) on conflict do nothing;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'role_assigned','user',target,target_company,jsonb_build_object('role',new_role));
end $$;

create or replace function public.remove_company_role(target uuid, target_company uuid, old_role app_role) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin_of(target_company) then raise exception 'not authorized'; end if;
  if target = auth.uid() then raise exception 'you cannot change your own roles'; end if;
  if old_role = 'system_administrator' and not exists(
    select 1 from public.user_company_roles r join public.user_profiles p on p.id = r.user_id and p.active
    where r.company_id = target_company and r.role = 'system_administrator' and r.user_id <> target) then raise exception 'the last system administrator of a company cannot be removed'; end if;
  delete from public.user_company_roles where user_id = target and company_id = target_company and role = old_role;
  if not found then raise exception 'role assignment not found'; end if;
  -- Branch access only makes sense while the user still has a role in the company.
  if not exists(select 1 from public.user_company_roles where user_id = target and company_id = target_company) then
    delete from public.user_branch_access a using public.branches b where a.user_id = target and a.branch_id = b.id and b.company_id = target_company;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,before_value)
  values(auth.uid(),'role_removed','user',target,target_company,jsonb_build_object('role',old_role));
end $$;

create or replace function public.set_user_active(target uuid, make_active boolean, reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare shared uuid; blocked uuid;
begin
  if target = auth.uid() then raise exception 'you cannot change your own active status'; end if;
  shared := public.admin_shares_company(target);
  if shared is null then raise exception 'not authorized'; end if;
  if not make_active then
    if coalesce(nullif(btrim(reason),''),'')='' then raise exception 'a reason is required to deactivate a user'; end if;
    select r.company_id into blocked from public.user_company_roles r
    where r.user_id = target and r.role = 'system_administrator' and not exists(
      select 1 from public.user_company_roles r2 join public.user_profiles p on p.id = r2.user_id and p.active
      where r2.company_id = r.company_id and r2.role = 'system_administrator' and r2.user_id <> target) limit 1;
    if blocked is not null then raise exception 'the last system administrator of a company cannot be deactivated'; end if;
  end if;
  update public.user_profiles set active = make_active where id = target;
  if not found then raise exception 'user not found'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(), case when make_active then 'user_activated' else 'user_deactivated' end,'user',target,shared,jsonb_build_object('reason',nullif(btrim(reason),'')));
end $$;

create or replace function public.assign_branch_access(target uuid, target_branch uuid) returns void
language plpgsql security definer set search_path=public as $$
declare company uuid;
begin
  select company_id into company from public.branches where id = target_branch and active;
  if company is null then raise exception 'branch must exist and be active'; end if;
  if not public.is_admin_of(company) then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.user_company_roles where user_id = target and company_id = company) then raise exception 'the user needs a role in the branch''s company first'; end if;
  insert into public.user_branch_access(user_id, branch_id) values(target, target_branch) on conflict do nothing;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'branch_access_granted','user',target,company,jsonb_build_object('branch_id',target_branch));
end $$;

create or replace function public.remove_branch_access(target uuid, target_branch uuid) returns void
language plpgsql security definer set search_path=public as $$
declare company uuid;
begin
  select company_id into company from public.branches where id = target_branch;
  if company is null or not public.is_admin_of(company) then raise exception 'not authorized'; end if;
  delete from public.user_branch_access where user_id = target and branch_id = target_branch;
  if not found then raise exception 'branch access not found'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,before_value)
  values(auth.uid(),'branch_access_revoked','user',target,company,jsonb_build_object('branch_id',target_branch));
end $$;

revoke all on function public.is_admin_of(uuid), public.admin_shares_company(uuid), public.assign_company_role(uuid,uuid,app_role), public.remove_company_role(uuid,uuid,app_role), public.set_user_active(uuid,boolean,text), public.assign_branch_access(uuid,uuid), public.remove_branch_access(uuid,uuid) from public, anon;
grant execute on function public.is_admin_of(uuid), public.admin_shares_company(uuid), public.assign_company_role(uuid,uuid,app_role), public.remove_company_role(uuid,uuid,app_role), public.set_user_active(uuid,boolean,text), public.assign_branch_access(uuid,uuid), public.remove_branch_access(uuid,uuid) to authenticated;

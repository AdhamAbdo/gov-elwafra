-- License management: validated creation, manual verification, and history-preserving renewal.
-- Licenses are never overwritten by a renewal; the new record links to the old one via renewal_of.

alter table public.licenses
  add column if not exists notes text,
  add column if not exists next_action text,
  add column if not exists renewal_status text not null default 'none' check (renewal_status in ('none','in_progress','renewed'));
alter table public.licenses drop constraint if exists licenses_verified_status_check;
alter table public.licenses add constraint licenses_verified_status_check check (verified_status in ('not_verified','verified_valid','verified_invalid'));
alter table public.licenses add constraint licenses_dates_check check (issue_date is null or expiry_date >= issue_date);

-- Authorities often keep the same license number across renewals, so uniqueness includes the expiry date.
alter table public.licenses drop constraint if exists licenses_company_id_license_number_key;
alter table public.licenses add constraint licenses_company_number_expiry_key unique (company_id, license_number, expiry_date);
create index if not exists licenses_company_branch_idx on public.licenses(company_id, branch_id);
create index if not exists licenses_renewal_of_idx on public.licenses(renewal_of);

create or replace function public.create_license(
  target_company uuid, target_branch uuid, type_name text, issuing_authority text, number_text text,
  issued date, expires date, note_text text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if not public.has_company_role(target_company, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if coalesce(nullif(btrim(type_name),''),'')='' or coalesce(nullif(btrim(issuing_authority),''),'')='' or coalesce(nullif(btrim(number_text),''),'')='' then raise exception 'license type, authority and number are required'; end if;
  if expires is null then raise exception 'expiry date is required'; end if;
  if issued is not null and expires < issued then raise exception 'expiry date cannot precede the issue date'; end if;
  if target_branch is not null and not exists(select 1 from public.branches where id=target_branch and company_id=target_company and active) then raise exception 'branch must be active and belong to company'; end if;
  insert into public.licenses(company_id,branch_id,license_type,authority,license_number,issue_date,expiry_date,notes)
  values(target_company,target_branch,btrim(type_name),btrim(issuing_authority),btrim(number_text),issued,expires,nullif(btrim(note_text),''))
  returning id into new_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'license_created','license',new_id,target_company,jsonb_build_object('type',btrim(type_name),'authority',btrim(issuing_authority),'expiry_date',expires,'branch_id',target_branch));
  return new_id;
end $$;

-- Records a manual check against the official source. It does not change the recorded expiry date.
create or replace function public.verify_license(license_id uuid, outcome text, note_text text default null) returns void
language plpgsql security definer set search_path=public as $$
declare lic public.licenses;
begin
  if outcome not in ('verified_valid','verified_invalid') then raise exception 'invalid verification outcome'; end if;
  select * into lic from public.licenses where id=license_id for update;
  if lic.id is null then raise exception 'license not found'; end if;
  if lic.branch_id is null then
    if not public.can_access_company(lic.company_id) then raise exception 'not authorized'; end if;
  elsif not public.can_access_branch(lic.company_id, lic.branch_id) then raise exception 'not authorized for branch'; end if;
  if not public.has_company_role(lic.company_id, array['compliance_officer','company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized to verify licenses'; end if;
  if outcome='verified_invalid' and coalesce(nullif(btrim(note_text),''),'')='' then raise exception 'a note is required when a license is found invalid'; end if;
  update public.licenses set verified_status=outcome, last_verified_at=now(), verification_owner=auth.uid() where id=license_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,before_value,after_value)
  values(auth.uid(),'license_verified','license',license_id,lic.company_id,jsonb_build_object('verified_status',lic.verified_status),jsonb_build_object('verified_status',outcome,'note',nullif(btrim(note_text),'')));
end $$;

-- Flags a renewal as underway and records the next required action. Does not claim the license is renewed.
create or replace function public.set_license_renewal_progress(license_id uuid, in_progress boolean, action_text text default null) returns void
language plpgsql security definer set search_path=public as $$
declare lic public.licenses;
begin
  select * into lic from public.licenses where id=license_id for update;
  if lic.id is null then raise exception 'license not found'; end if;
  if not public.has_company_role(lic.company_id, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if lic.renewal_status='renewed' then raise exception 'license has already been renewed'; end if;
  update public.licenses set renewal_status=case when in_progress then 'in_progress' else 'none' end, next_action=nullif(btrim(action_text),'') where id=license_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'license_renewal_progress','license',license_id,lic.company_id,jsonb_build_object('in_progress',in_progress,'next_action',nullif(btrim(action_text),'')));
end $$;

-- Registers the renewed license as a NEW record linked to the old one; the old record is kept intact.
create or replace function public.renew_license(old_license_id uuid, number_text text, issued date, expires date) returns uuid
language plpgsql security definer set search_path=public as $$
declare old public.licenses; new_id uuid;
begin
  select * into old from public.licenses where id=old_license_id for update;
  if old.id is null then raise exception 'license not found'; end if;
  if not public.has_company_role(old.company_id, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if old.renewal_status='renewed' then raise exception 'license has already been renewed'; end if;
  if expires is null or expires <= old.expiry_date then raise exception 'the renewed license must expire after the previous one'; end if;
  if issued is not null and expires < issued then raise exception 'expiry date cannot precede the issue date'; end if;
  insert into public.licenses(company_id,branch_id,license_type,authority,license_number,issue_date,expiry_date,renewal_of)
  values(old.company_id,old.branch_id,old.license_type,old.authority,coalesce(nullif(btrim(number_text),''),old.license_number),issued,expires,old.id)
  returning id into new_id;
  update public.licenses set renewal_status='renewed', next_action=null where id=old.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,before_value,after_value)
  values(auth.uid(),'license_renewed','license',new_id,old.company_id,jsonb_build_object('previous_license_id',old.id,'previous_expiry',old.expiry_date),jsonb_build_object('expiry_date',expires));
  return new_id;
end $$;

revoke all on function public.create_license(uuid,uuid,text,text,text,date,date,text), public.verify_license(uuid,text,text), public.set_license_renewal_progress(uuid,boolean,text), public.renew_license(uuid,text,date,date) from public, anon;
grant execute on function public.create_license(uuid,uuid,text,text,text,date,date,text), public.verify_license(uuid,text,text), public.set_license_renewal_progress(uuid,boolean,text), public.renew_license(uuid,text,date,date) to authenticated;

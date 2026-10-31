-- Compliance officers may add licenses (previously managers only). Renewal and renewal tracking stay manager-only.
-- A branch-scoped officer can only add a license for a branch they can access, or at company level if they can access the company.
create or replace function public.create_license(
  target_company uuid, target_branch uuid, type_name text, issuing_authority text, number_text text,
  issued date, expires date, note_text text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if not public.has_company_role(target_company, array['compliance_officer','company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if target_branch is null then
    if not public.can_access_company(target_company) then raise exception 'not authorized'; end if;
  elsif not public.can_access_branch(target_company, target_branch) then raise exception 'not authorized for branch'; end if;
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

revoke all on function public.create_license(uuid,uuid,text,text,text,date,date,text) from public, anon;
grant execute on function public.create_license(uuid,uuid,text,text,text,date,date,text) to authenticated;

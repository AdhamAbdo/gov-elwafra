-- Controlled creation of compliance obligations. There is intentionally no
-- direct INSERT policy on compliance_items; use this validated RPC instead.
create or replace function public.create_compliance_item(
  target_company uuid,
  target_branch uuid,
  item_name text,
  item_category text,
  item_authority text default null,
  item_owner uuid default null,
  item_risk text default 'medium',
  item_evidence_required boolean default false,
  item_weekly_required boolean default true
) returns uuid
language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if coalesce(nullif(btrim(item_name),''),'')='' then raise exception 'obligation name is required'; end if;
  if coalesce(nullif(btrim(item_category),''),'')='' then raise exception 'obligation category is required'; end if;
  if item_risk not in ('low','medium','high','critical') then raise exception 'invalid risk level'; end if;
  if not public.has_company_role(target_company,array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if target_branch is not null and not exists(select 1 from public.branches where id=target_branch and company_id=target_company and active) then raise exception 'branch must be active and belong to company'; end if;
  if item_owner is not null and not exists(select 1 from public.user_company_roles where user_id=item_owner and company_id=target_company) then raise exception 'owner must have company access'; end if;
  insert into public.compliance_items(company_id,branch_id,name,category,authority,applicable,owner_id,risk_level,evidence_required,weekly_required,active)
  values(target_company,target_branch,btrim(item_name),btrim(item_category),nullif(btrim(item_authority),''),true,item_owner,item_risk,item_evidence_required,item_weekly_required,true)
  returning id into new_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'compliance_item_created','compliance_item',new_id,target_company,jsonb_build_object('branch_id',target_branch,'evidence_required',item_evidence_required,'weekly_required',item_weekly_required));
  return new_id;
end $$;

revoke all on function public.create_compliance_item(uuid,uuid,text,text,text,uuid,text,boolean,boolean) from public,anon;
grant execute on function public.create_compliance_item(uuid,uuid,text,text,text,uuid,text,boolean,boolean) to authenticated;

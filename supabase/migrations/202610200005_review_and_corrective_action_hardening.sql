-- Reviewer and corrective-action state transitions.
create or replace function public.decide_review(check_id uuid, decision review_status, reason_text text default null) returns void
language plpgsql security definer set search_path=public as $$
declare checked public.compliance_checks; company uuid;
begin
  if decision not in ('approved','returned','escalated') then raise exception 'invalid review decision'; end if;
  select c.* into checked from public.compliance_checks c where c.id=check_id for update;
  if checked.id is null then raise exception 'inspection check not found'; end if;
  if checked.review_status <> 'pending_review' then raise exception 'only pending inspection results may be reviewed'; end if;
  select t.company_id into company from public.inspection_tasks t where t.id=checked.inspection_task_id;
  if not public.has_company_role(company,array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if checked.performed_by=auth.uid() then raise exception 'reviewer cannot review own inspection'; end if;
  if decision='returned' and coalesce(nullif(btrim(reason_text),''),'')='' then raise exception 'return reason is required'; end if;
  update public.compliance_checks set review_status=decision where id=check_id;
  if decision='returned' then
    update public.inspection_tasks set status=case when assigned_to is null then 'unassigned'::task_status else 'assigned'::task_status end where id=checked.inspection_task_id;
  end if;
  insert into public.review_decisions(compliance_check_id,reviewer_id,decision,reason)
  values(check_id,auth.uid(),decision,nullif(btrim(reason_text),''));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'review_'||decision::text,'compliance_check',check_id,company,jsonb_build_object('reason',nullif(btrim(reason_text),'')));
end $$;

create or replace function public.create_corrective_action(check_id uuid, action_title text, owner uuid, due timestamptz, action_priority text default 'medium') returns uuid
language plpgsql security definer set search_path=public as $$
declare company uuid; action_id uuid;
begin
  if coalesce(nullif(btrim(action_title),''),'')='' then raise exception 'action title is required'; end if;
  if action_priority not in ('low','medium','high','critical') then raise exception 'invalid priority'; end if;
  select t.company_id into company from public.compliance_checks c join public.inspection_tasks t on t.id=c.inspection_task_id where c.id=check_id;
  if company is null or not public.has_company_role(company,array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.compliance_checks where id=check_id and compliance_status='action_required') then raise exception 'corrective action requires an action-required finding'; end if;
  if owner is not null and not exists(select 1 from public.user_company_roles where user_id=owner and company_id=company) then raise exception 'action owner must have company access'; end if;
  insert into public.corrective_actions(compliance_check_id,title,assigned_to,due_at,priority)
  values(check_id,btrim(action_title),owner,due,action_priority) returning id into action_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'corrective_action_created','corrective_action',action_id,company,jsonb_build_object('check_id',check_id,'owner',owner,'due_at',due));
  return action_id;
end $$;

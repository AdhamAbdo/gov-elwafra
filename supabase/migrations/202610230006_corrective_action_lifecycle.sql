-- Corrective-action lifecycle: assignment, audited verification request, independent closure,
-- overdue marking, and read access to the caller's own role assignments (UI affordances only;
-- every transition below is still authorized inside the function).

create policy own_roles_read on public.user_company_roles for select using (user_id = auth.uid());

-- Assignable users for a company. Managers only; returns only active users with access to that company.
create or replace function public.list_company_assignees(target_company uuid)
returns table(user_id uuid, display_name text, role app_role)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_company_role(target_company, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  return query
    select r.user_id, p.display_name, r.role
    from public.user_company_roles r join public.user_profiles p on p.id = r.user_id and p.active
    where r.company_id = target_company and r.role <> 'read_only'
    order by p.display_name;
end $$;

create or replace function public.assign_corrective_action(action_id uuid, owner uuid, due timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
declare company uuid; current_status action_status;
begin
  select t.company_id, a.status into company, current_status
  from public.corrective_actions a join public.compliance_checks c on c.id=a.compliance_check_id join public.inspection_tasks t on t.id=c.inspection_task_id
  where a.id = action_id for update of a;
  if company is null then raise exception 'corrective action not found'; end if;
  if not public.has_company_role(company, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if current_status = 'resolved' then raise exception 'resolved actions cannot be reassigned'; end if;
  if owner is not null and not exists(select 1 from public.user_company_roles where user_id=owner and company_id=company and role <> 'read_only') then raise exception 'action owner must be an active non-read-only company user'; end if;
  update public.corrective_actions set assigned_to = owner, due_at = coalesce(due, due_at) where id = action_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'corrective_action_assigned','corrective_action',action_id,company,jsonb_build_object('owner',owner,'due_at',due));
end $$;

create or replace function public.request_action_verification(action_id uuid, notes text) returns void
language plpgsql security definer set search_path=public as $$
declare company uuid;
begin
  if coalesce(nullif(btrim(notes),''),'')='' then raise exception 'resolution notes are required'; end if;
  update public.corrective_actions set status='pending_verification', resolution_notes=btrim(notes)
  where id=action_id and assigned_to=auth.uid() and status in ('open','in_progress','overdue');
  if not found then raise exception 'action is not available for resolution'; end if;
  select t.company_id into company from public.corrective_actions a join public.compliance_checks c on c.id=a.compliance_check_id join public.inspection_tasks t on t.id=c.inspection_task_id where a.id=action_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'corrective_action_verification_requested','corrective_action',action_id,company,jsonb_build_object('notes',btrim(notes)));
end $$;

-- Independent verification: the assigned owner may not close their own action.
-- Returning to work requires a reason; closing records the verifier and timestamp.
create or replace function public.close_corrective_action(action_id uuid, close_it boolean, notes text default null) returns void
language plpgsql security definer set search_path=public as $$
declare company uuid; owner uuid;
begin
  select t.company_id, a.assigned_to into company, owner
  from public.corrective_actions a join public.compliance_checks c on c.id=a.compliance_check_id join public.inspection_tasks t on t.id=c.inspection_task_id
  where a.id = action_id;
  if company is null or not public.has_company_role(company, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if owner = auth.uid() then raise exception 'the action owner cannot verify their own action'; end if;
  if not close_it and coalesce(nullif(btrim(notes),''),'')='' then raise exception 'a reason is required to return an action'; end if;
  update public.corrective_actions
  set status = case when close_it then 'resolved'::action_status else 'in_progress'::action_status end,
      closure_reviewer = auth.uid(), resolved_at = case when close_it then now() else null end,
      resolution_notes = coalesce(nullif(btrim(notes),''), resolution_notes)
  where id = action_id and status = 'pending_verification';
  if not found then raise exception 'action is not pending verification'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(), case when close_it then 'corrective_action_resolved' else 'corrective_action_returned' end,'corrective_action',action_id,company,jsonb_build_object('notes',nullif(btrim(notes),'')));
end $$;

-- Scheduler hook: idempotent; only open/in-progress actions past due become overdue. Never touches resolved work.
create or replace function public.mark_overdue_corrective_actions() returns integer
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  update public.corrective_actions set status='overdue' where status in ('open','in_progress') and due_at is not null and due_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.list_company_assignees(uuid), public.assign_corrective_action(uuid,uuid,timestamptz), public.request_action_verification(uuid,text), public.close_corrective_action(uuid,boolean,text), public.mark_overdue_corrective_actions() from public, anon;
grant execute on function public.list_company_assignees(uuid), public.assign_corrective_action(uuid,uuid,timestamptz), public.request_action_verification(uuid,text), public.close_corrective_action(uuid,boolean,text) to authenticated;
grant execute on function public.mark_overdue_corrective_actions() to service_role;

-- Branch-scope fix: action_read previously used company-level access only, exposing other branches' actions to branch-limited officers.
drop policy if exists action_read on public.corrective_actions;
create policy action_read on public.corrective_actions for select using (exists(
  select 1 from public.compliance_checks c join public.inspection_tasks t on t.id = c.inspection_task_id
  where c.id = compliance_check_id
    and (t.branch_id is null and public.can_access_company(t.company_id) or t.branch_id is not null and public.can_access_branch(t.company_id, t.branch_id))));

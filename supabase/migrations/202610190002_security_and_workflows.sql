-- Security correction and workflow transitions. Apply after 202610190001.
-- Every role is explicitly assigned to one company; cross-company managers receive three assignments.
alter table public.user_company_roles alter column company_id set not null;
alter table public.audit_logs add column if not exists company_id uuid references public.companies(id);

create or replace function public.can_access_company(company uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.user_company_roles r
    join public.user_profiles p on p.id = r.user_id and p.active
    where r.user_id = auth.uid() and r.company_id = company)
$$;

create or replace function public.can_access_branch(target_company uuid, target_branch uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.user_company_roles r join public.user_profiles p on p.id=r.user_id and p.active
      where r.user_id=auth.uid() and r.company_id=target_company and r.role in ('general_manager','company_manager','system_administrator'))
  or exists (select 1 from public.user_branch_access a where a.user_id=auth.uid() and a.branch_id=target_branch)
$$;

create or replace function public.has_company_role(target_company uuid, accepted app_role[]) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.user_company_roles r join public.user_profiles p on p.id=r.user_id and p.active
 where r.user_id=auth.uid() and r.company_id=target_company and r.role=any(accepted))
$$;

create or replace function public.validate_company_branch() returns trigger language plpgsql as $$
declare branch_company uuid;
begin
  if new.branch_id is not null then
    select company_id into branch_company from public.branches where id=new.branch_id;
    if branch_company is null or branch_company <> new.company_id then raise exception 'branch must belong to the record company'; end if;
  end if;
  return new;
end $$;
create trigger employees_branch_matches_company before insert or update of company_id,branch_id on public.employees for each row execute function public.validate_company_branch();
create trigger obligations_branch_matches_company before insert or update of company_id,branch_id on public.compliance_items for each row execute function public.validate_company_branch();
create trigger licenses_branch_matches_company before insert or update of company_id,branch_id on public.licenses for each row execute function public.validate_company_branch();
create trigger tasks_branch_matches_company before insert or update of company_id,branch_id on public.inspection_tasks for each row execute function public.validate_company_branch();

-- Enable RLS on every business table. Mutating tables deliberately receive no generic client write policy.
alter table public.user_profiles enable row level security;
alter table public.user_company_roles enable row level security;
alter table public.user_branch_access enable row level security;
alter table public.employees enable row level security;
alter table public.licenses enable row level security;
alter table public.contracts enable row level security;
alter table public.employee_events enable row level security;
alter table public.review_cycles enable row level security;
alter table public.review_decisions enable row level security;
alter table public.corrective_actions enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_delivery_attempts enable row level security;
alter table public.audit_logs enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_errors enable row level security;
alter table public.scheduler_runs enable row level security;

drop policy if exists branch_access on public.branches;
drop policy if exists obligation_access on public.compliance_items;
drop policy if exists task_access on public.inspection_tasks;
drop policy if exists check_access on public.compliance_checks;
create policy branch_read on public.branches for select using (public.can_access_branch(company_id,id));
create policy obligation_read on public.compliance_items for select using (branch_id is null and public.can_access_company(company_id) or branch_id is not null and public.can_access_branch(company_id,branch_id));
create policy task_read on public.inspection_tasks for select using (branch_id is null and public.can_access_company(company_id) or branch_id is not null and public.can_access_branch(company_id,branch_id));
create policy employee_read on public.employees for select using (branch_id is null and public.can_access_company(company_id) or branch_id is not null and public.can_access_branch(company_id,branch_id));
create policy license_read on public.licenses for select using (branch_id is null and public.can_access_company(company_id) or branch_id is not null and public.can_access_branch(company_id,branch_id));
create policy check_read_v2 on public.compliance_checks for select using (exists(select 1 from public.inspection_tasks t where t.id=inspection_task_id and (t.branch_id is null and public.can_access_company(t.company_id) or t.branch_id is not null and public.can_access_branch(t.company_id,t.branch_id))));
create policy action_read on public.corrective_actions for select using (exists(select 1 from public.compliance_checks c join public.inspection_tasks t on t.id=c.inspection_task_id where c.id=compliance_check_id and public.can_access_company(t.company_id)));
create policy notification_read on public.notifications for select using (recipient_id=auth.uid());
create policy audit_read on public.audit_logs for select using (company_id is not null and public.has_company_role(company_id,array['general_manager','company_manager','system_administrator']::app_role[]));
create policy profile_read on public.user_profiles for select using (id=auth.uid());
create policy cycle_read on public.review_cycles for select using (auth.uid() is not null);

create or replace function public.generate_weekly_tasks(cycle_id uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare created_count integer;
begin
  if not exists(select 1 from public.review_cycles where id=cycle_id) then raise exception 'review cycle not found'; end if;
  perform pg_advisory_xact_lock(hashtext('weekly-inspections:' || cycle_id::text));
  insert into public.inspection_tasks(compliance_item_id,review_cycle_id,company_id,branch_id,assigned_to,status)
    select c.id,cycle_id,c.company_id,c.branch_id,c.owner_id,case when c.owner_id is null then 'unassigned'::task_status else 'assigned'::task_status end
    from public.compliance_items c where c.active and c.applicable and c.weekly_required
    on conflict(compliance_item_id,review_cycle_id) do nothing;
  get diagnostics created_count = row_count;
  return created_count;
end $$;

create or replace function public.submit_inspection(task_id uuid, result compliance_status, observation_text text, evidence_ref text) returns uuid
language plpgsql security definer set search_path=public as $$
declare task_row public.inspection_tasks; item public.compliance_items; check_id uuid;
begin
 select * into task_row from public.inspection_tasks where id=task_id for update;
 if task_row.id is null then raise exception 'task not found'; end if;
 if not public.can_access_company(task_row.company_id) then raise exception 'not authorized'; end if;
 if task_row.assigned_to is not null and task_row.assigned_to <> auth.uid() and not public.has_company_role(task_row.company_id,array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'task assigned to another user'; end if;
 select * into item from public.compliance_items where id=task_row.compliance_item_id;
 if item.evidence_required and coalesce(nullif(evidence_ref,''),'')='' then raise exception 'evidence is required'; end if;
 insert into public.compliance_checks(inspection_task_id,performed_by,performed_at,compliance_status,review_status,observation,evidence_reference,submitted_at)
 values(task_id,auth.uid(),now(),result,'pending_review',observation_text,nullif(evidence_ref,''),now())
 on conflict(inspection_task_id) do update set performed_by=excluded.performed_by,performed_at=excluded.performed_at,compliance_status=excluded.compliance_status,review_status='pending_review',observation=excluded.observation,evidence_reference=excluded.evidence_reference,submitted_at=excluded.submitted_at
 where public.compliance_checks.review_status in ('pending_review','returned')
 returning id into check_id;
 if check_id is null then raise exception 'approved or escalated inspection cannot be overwritten'; end if;
 update public.inspection_tasks set status='submitted' where id=task_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value) values(auth.uid(),'inspection_submitted','compliance_check',check_id,task_row.company_id,jsonb_build_object('status',result));
 return check_id;
end $$;

create or replace function public.decide_review(check_id uuid, decision review_status, reason_text text default null) returns void
language plpgsql security definer set search_path=public as $$
declare checked public.compliance_checks; company uuid;
begin
 if decision not in ('approved','returned','escalated') then raise exception 'invalid review decision'; end if;
 select c.* into checked from public.compliance_checks c where c.id=check_id for update;
 select t.company_id into company from public.inspection_tasks t where t.id=checked.inspection_task_id;
 if checked.id is null or not public.has_company_role(company,array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
 if checked.performed_by=auth.uid() then raise exception 'reviewer cannot approve own inspection'; end if;
 if decision='returned' and coalesce(nullif(reason_text,''),'')='' then raise exception 'return reason is required'; end if;
 update public.compliance_checks set review_status=decision where id=check_id;
 insert into public.review_decisions(compliance_check_id,reviewer_id,decision,reason) values(check_id,auth.uid(),decision,nullif(reason_text,''));
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value) values(auth.uid(),'review_'||decision::text,'compliance_check',check_id,company,jsonb_build_object('reason',reason_text));
end $$;

create or replace function public.create_corrective_action(check_id uuid, action_title text, owner uuid, due timestamptz, action_priority text default 'medium') returns uuid
language plpgsql security definer set search_path=public as $$
declare company uuid; action_id uuid;
begin
 select t.company_id into company from public.compliance_checks c join public.inspection_tasks t on t.id=c.inspection_task_id where c.id=check_id;
 if company is null or not public.has_company_role(company,array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
 insert into public.corrective_actions(compliance_check_id,title,assigned_to,due_at,priority) values(check_id,action_title,owner,due,action_priority) returning id into action_id;
 return action_id;
end $$;

create or replace function public.request_action_verification(action_id uuid, notes text) returns void language plpgsql security definer set search_path=public as $$
begin
 update public.corrective_actions set status='pending_verification',resolution_notes=notes where id=action_id and assigned_to=auth.uid() and status in ('open','in_progress','overdue');
 if not found then raise exception 'action is not available for resolution'; end if;
end $$;
create or replace function public.close_corrective_action(action_id uuid, close_it boolean, notes text default null) returns void language plpgsql security definer set search_path=public as $$
declare company uuid;
begin
 select t.company_id into company from public.corrective_actions a join public.compliance_checks c on c.id=a.compliance_check_id join public.inspection_tasks t on t.id=c.inspection_task_id where a.id=action_id;
 if company is null or not public.has_company_role(company,array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
 update public.corrective_actions set status=case when close_it then 'resolved' else 'in_progress' end, closure_reviewer=auth.uid(),resolved_at=case when close_it then now() else null end,resolution_notes=coalesce(notes,resolution_notes) where id=action_id and status='pending_verification';
 if not found then raise exception 'action is not pending verification'; end if;
end $$;

create or replace function public.schedule_notification(recipient uuid, event text, schedule_at timestamptz, notification_key text) returns uuid language plpgsql security definer set search_path=public as $$
declare notice_id uuid;
begin
 insert into public.notifications(recipient_id,event_type,scheduled_at,idempotency_key) values(recipient,event,schedule_at,notification_key)
 on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into notice_id;
 return notice_id;
end $$;

revoke all on function public.generate_weekly_tasks(uuid) from public,anon,authenticated;
grant execute on function public.generate_weekly_tasks(uuid) to service_role;
revoke all on function public.submit_inspection(uuid,compliance_status,text,text),public.decide_review(uuid,review_status,text),public.create_corrective_action(uuid,text,uuid,timestamptz,text),public.request_action_verification(uuid,text),public.close_corrective_action(uuid,boolean,text),public.schedule_notification(uuid,text,timestamptz,text) from public,anon;
grant execute on function public.submit_inspection(uuid,compliance_status,text,text),public.decide_review(uuid,review_status,text),public.create_corrective_action(uuid,text,uuid,timestamptz,text),public.request_action_verification(uuid,text),public.close_corrective_action(uuid,boolean,text) to authenticated;
grant execute on function public.schedule_notification(uuid,text,timestamptz,text) to service_role;

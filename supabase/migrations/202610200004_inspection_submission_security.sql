-- Tighten submission authorization before exposing the inspection form.
create or replace function public.submit_inspection(task_id uuid, result compliance_status, observation_text text, evidence_ref text) returns uuid
language plpgsql security definer set search_path=public as $$
declare task_row public.inspection_tasks; item public.compliance_items; check_id uuid;
begin
 select * into task_row from public.inspection_tasks where id=task_id for update;
 if task_row.id is null then raise exception 'task not found'; end if;
 if task_row.branch_id is null then
   if not public.can_access_company(task_row.company_id) then raise exception 'not authorized'; end if;
 elsif not public.can_access_branch(task_row.company_id,task_row.branch_id) then
   raise exception 'not authorized for branch';
 end if;
 if not public.has_company_role(task_row.company_id,array['compliance_officer','company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized to submit inspections'; end if;
 if task_row.assigned_to is not null and task_row.assigned_to <> auth.uid() and not public.has_company_role(task_row.company_id,array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'task assigned to another user'; end if;
 select * into item from public.compliance_items where id=task_row.compliance_item_id;
 if item.evidence_required and coalesce(nullif(btrim(evidence_ref),''),'')='' then raise exception 'evidence is required'; end if;
 if result='not_applicable' and coalesce(nullif(btrim(observation_text),''),'')='' then raise exception 'not applicable requires documented reason'; end if;
 insert into public.compliance_checks(inspection_task_id,performed_by,performed_at,compliance_status,review_status,observation,evidence_reference,submitted_at)
 values(task_id,auth.uid(),now(),result,'pending_review',nullif(btrim(observation_text),''),nullif(btrim(evidence_ref),''),now())
 on conflict(inspection_task_id) do update set performed_by=excluded.performed_by,performed_at=excluded.performed_at,compliance_status=excluded.compliance_status,review_status='pending_review',observation=excluded.observation,evidence_reference=excluded.evidence_reference,submitted_at=excluded.submitted_at
 where public.compliance_checks.review_status in ('pending_review','returned')
 returning id into check_id;
 if check_id is null then raise exception 'approved or escalated inspection cannot be overwritten'; end if;
 update public.inspection_tasks set status='submitted' where id=task_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
 values(auth.uid(),'inspection_submitted','compliance_check',check_id,task_row.company_id,jsonb_build_object('status',result));
 return check_id;
end $$;

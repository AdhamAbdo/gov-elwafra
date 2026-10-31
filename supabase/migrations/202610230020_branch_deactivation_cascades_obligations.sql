-- Deactivating a department used to be refused while it still had active obligations, but the app has no screen or
-- function to deactivate or move an obligation, so a department with obligations could never be deactivated.
-- Deactivation now switches the department's active obligations off in the same transaction and records how many
-- in the audit log. Active employees must still be reassigned first (the employee edit form can do that).
-- Reactivating the department does NOT reactivate its obligations; they were closed with it and are re-created on purpose.

create or replace function public.set_branch_active(branch_id uuid, make_active boolean, reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare b public.branches; closed integer := 0;
begin
  select * into b from public.branches where id=branch_id for update;
  if b.id is null then raise exception 'branch not found'; end if;
  if not public.has_company_role(b.company_id, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if make_active and not exists(select 1 from public.companies where id=b.company_id and active) then raise exception 'the company is inactive'; end if;
  if not make_active then
    if coalesce(nullif(btrim(reason),''),'')='' then raise exception 'a reason is required to deactivate a branch'; end if;
    if exists(select 1 from public.employees where employees.branch_id=set_branch_active.branch_id and employees.employment_status in ('active','on_leave')) then raise exception 'reassign the branch''s active employees first'; end if;
    update public.compliance_items set active=false where compliance_items.branch_id=set_branch_active.branch_id and compliance_items.active;
    get diagnostics closed = row_count;
  end if;
  update public.branches set active=make_active where id=branch_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),case when make_active then 'branch_activated' else 'branch_deactivated' end,'branch',branch_id,b.company_id,
    jsonb_build_object('reason',nullif(btrim(reason),'')) || case when make_active then '{}'::jsonb else jsonb_build_object('obligations_deactivated',closed) end);
end $$;

revoke all on function public.set_branch_active(uuid,boolean,text) from public, anon;
grant execute on function public.set_branch_active(uuid,boolean,text) to authenticated;

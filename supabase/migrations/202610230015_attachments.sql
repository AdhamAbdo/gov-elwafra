-- Private file attachments. Files live in a PRIVATE storage bucket that no client role can touch directly
-- (no storage.objects policies = deny by default); the server uploads/signs with the service role only AFTER the
-- functions below authorize the caller. Removal is a soft delete: the file and its metadata are retained.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

alter table public.attachments
  add column if not exists company_id uuid references public.companies(id),
  add column if not exists file_name text not null default '',
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint check (size_bytes is null or (size_bytes > 0 and size_bytes <= 10485760)),
  add column if not exists sha256 text,
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references public.user_profiles(id),
  add column if not exists removal_reason text;
alter table public.attachments add constraint attachments_entity_type_check check (entity_type in ('license','contract','employee_event','platform_verification','compliance_check','corrective_action'));
alter table public.attachments add constraint attachments_removal_check check ((removed_at is null) = (removal_reason is null));
create index if not exists attachments_entity_idx on public.attachments(entity_type, entity_id) where removed_at is null;

-- Resolves the owning company/branch of an attachable record. t_employee: contains employee data (restricted audience).
-- t_locked: the record is closed to new evidence (approved inspection result, resolved corrective action).
create or replace function public.attachment_target(et text, eid uuid) returns table(t_company uuid, t_branch uuid, t_employee boolean, t_locked boolean)
language plpgsql stable security definer set search_path=public as $$
begin
  if et = 'license' then return query select l.company_id, l.branch_id, false, false from public.licenses l where l.id = eid;
  elsif et = 'contract' then return query select e.company_id, e.branch_id, true, false from public.contracts c join public.employees e on e.id = c.employee_id where c.id = eid;
  elsif et = 'employee_event' then return query select e.company_id, e.branch_id, true, false from public.employee_events ev join public.employees e on e.id = ev.employee_id where ev.id = eid;
  elsif et = 'platform_verification' then return query select v.company_id, v.branch_id, false, false from public.platform_verifications v where v.id = eid;
  elsif et = 'compliance_check' then return query select t.company_id, t.branch_id, false, (c.review_status = 'approved') from public.compliance_checks c join public.inspection_tasks t on t.id = c.inspection_task_id where c.id = eid;
  elsif et = 'corrective_action' then return query select t.company_id, t.branch_id, false, (a.status = 'resolved') from public.corrective_actions a join public.compliance_checks c on c.id = a.compliance_check_id join public.inspection_tasks t on t.id = c.inspection_task_id where a.id = eid;
  end if;
end $$;

create or replace function public.can_read_attachments(et text, eid uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.attachment_target(et, eid) t where
    case when t.t_employee then public.can_view_employee_data(t.t_company, t.t_branch)
         when t.t_branch is null then public.can_access_company(t.t_company)
         else public.can_access_branch(t.t_company, t.t_branch) end)
$$;

create or replace function public.can_write_attachments(et text, eid uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.can_read_attachments(et, eid) and exists(select 1 from public.attachment_target(et, eid) t
    where not t.t_locked and public.has_company_role(t.t_company, array['compliance_officer','company_manager','general_manager','system_administrator']::app_role[]))
$$;

create policy attachments_read on public.attachments for select using (removed_at is null and public.can_read_attachments(entity_type, entity_id));

-- Step 1 for uploads: returns the company id (used in the storage path) or raises.
create or replace function public.attachment_upload_check(et text, eid uuid) returns uuid
language plpgsql stable security definer set search_path=public as $$
declare company uuid; locked boolean;
begin
  select t_company, t_locked into company, locked from public.attachment_target(et, eid);
  if company is null or not public.can_read_attachments(et, eid) then raise exception 'not authorized'; end if;
  if locked then raise exception 'this record is closed to new attachments'; end if;
  if not public.can_write_attachments(et, eid) then raise exception 'not authorized to attach files'; end if;
  return company;
end $$;

create or replace function public.register_attachment(att_id uuid, et text, eid uuid, path text, fname text, mime text, size bigint, hash text) returns void
language plpgsql security definer set search_path=public as $$
declare company uuid;
begin
  company := public.attachment_upload_check(et, eid);
  if path is null or path !~ ('^' || company::text || '/' || et || '/' || eid::text || '/' || att_id::text || '\.[a-z0-9]{2,5}$') then raise exception 'invalid storage path'; end if;
  insert into public.attachments(id, entity_type, entity_id, storage_path, uploaded_by, company_id, file_name, mime_type, size_bytes, sha256)
  values(att_id, et, eid, path, auth.uid(), company, left(fname, 150), mime, size, hash);
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, company_id, after_value)
  values(auth.uid(), 'attachment_uploaded', et, eid, company, jsonb_build_object('attachment_id', att_id, 'file_name', left(fname, 150), 'size_bytes', size));
end $$;

-- Authorizes AND records a file access (download). Returns what the server needs to sign a short-lived URL.
create or replace function public.get_attachment_for_download(att_id uuid) returns table(storage_path text, file_name text)
language plpgsql security definer set search_path=public as $$
declare a public.attachments;
begin
  select * into a from public.attachments where id = att_id and removed_at is null;
  if a.id is null or not public.can_read_attachments(a.entity_type, a.entity_id) then raise exception 'not authorized'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, company_id, after_value)
  values(auth.uid(), 'attachment_accessed', a.entity_type, a.entity_id, a.company_id, jsonb_build_object('attachment_id', a.id, 'file_name', a.file_name));
  return query select a.storage_path, a.file_name;
end $$;

create or replace function public.remove_attachment(att_id uuid, reason text) returns void
language plpgsql security definer set search_path=public as $$
declare a public.attachments;
begin
  select * into a from public.attachments where id = att_id and removed_at is null for update;
  if a.id is null then raise exception 'attachment not found'; end if;
  if not public.can_write_attachments(a.entity_type, a.entity_id) then raise exception 'not authorized'; end if;
  if a.uploaded_by is distinct from auth.uid() and not public.has_company_role(a.company_id, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'only the uploader or a manager can remove an attachment'; end if;
  if coalesce(nullif(btrim(reason), ''), '') = '' then raise exception 'a reason is required'; end if;
  update public.attachments set removed_at = now(), removed_by = auth.uid(), removal_reason = btrim(reason) where id = att_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, company_id, after_value)
  values(auth.uid(), 'attachment_removed', a.entity_type, a.entity_id, a.company_id, jsonb_build_object('attachment_id', a.id, 'file_name', a.file_name, 'reason', btrim(reason)));
end $$;

revoke all on function public.attachment_target(text,uuid), public.can_read_attachments(text,uuid), public.can_write_attachments(text,uuid), public.attachment_upload_check(text,uuid), public.register_attachment(uuid,text,uuid,text,text,text,bigint,text), public.get_attachment_for_download(uuid), public.remove_attachment(uuid,text) from public, anon;
grant execute on function public.attachment_upload_check(text,uuid), public.register_attachment(uuid,text,uuid,text,text,text,bigint,text), public.get_attachment_for_download(uuid), public.remove_attachment(uuid,text) to authenticated;
grant execute on function public.attachment_target(text,uuid), public.can_read_attachments(text,uuid), public.can_write_attachments(text,uuid) to authenticated;

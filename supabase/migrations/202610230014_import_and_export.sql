-- Validated bulk import (licenses, employees) and export auditing.
-- Import functions re-validate every row on the server, NEVER overwrite existing records (duplicates are skipped and reported),
-- run in one transaction, and leave an import_jobs / import_errors trail plus an audit entry.

alter table public.import_jobs
  add column if not exists entity_type text,
  add column if not exists company_id uuid references public.companies(id),
  add column if not exists file_name text,
  add column if not exists total_rows integer,
  add column if not exists imported_rows integer,
  add column if not exists skipped_rows integer;
alter table public.import_errors add column if not exists kind text not null default 'invalid' check (kind in ('invalid','duplicate'));
create index if not exists import_jobs_company_idx on public.import_jobs(company_id, created_at desc);
create index if not exists import_errors_job_idx on public.import_errors(import_job_id);

create policy import_jobs_read on public.import_jobs for select using (company_id is not null and public.has_company_role(company_id, array['company_manager','general_manager','system_administrator']::app_role[]));
create policy import_errors_read on public.import_errors for select using (exists(select 1 from public.import_jobs j where j.id = import_job_id and j.company_id is not null and public.has_company_role(j.company_id, array['company_manager','general_manager','system_administrator']::app_role[])));

create or replace function public.safe_date(txt text) returns date
language plpgsql immutable as $$
begin
  if txt is null or btrim(txt) = '' then return null; end if;
  return btrim(txt)::date;
exception when others then return null;
end $$;

create or replace function public.import_licenses(target_company uuid, file_label text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare job uuid; r jsonb; n integer := 0; imported integer := 0; skipped integer := 0; ln integer;
  v_type text; v_auth text; v_num text; v_issue date; v_exp date; v_branch_name text; v_branch uuid; v_notes text; problems jsonb := '[]'::jsonb;
begin
  if not public.has_company_role(target_company, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.companies where id = target_company and active) then raise exception 'company must exist and be active'; end if;
  if jsonb_typeof(payload) <> 'array' then raise exception 'payload must be an array'; end if;
  if jsonb_array_length(payload) = 0 or jsonb_array_length(payload) > 1000 then raise exception 'an import must contain between 1 and 1000 rows'; end if;
  insert into public.import_jobs(requested_by,status,entity_type,company_id,file_name,total_rows) values(auth.uid(),'running','licenses',target_company,left(file_label,200),jsonb_array_length(payload)) returning id into job;
  for r in select * from jsonb_array_elements(payload) loop
    n := n + 1; ln := coalesce((r->>'line')::integer, n + 1);
    v_type := nullif(btrim(r->>'license_type'),''); v_auth := nullif(btrim(r->>'authority'),''); v_num := nullif(btrim(r->>'license_number'),'');
    v_issue := public.safe_date(r->>'issue_date'); v_exp := public.safe_date(r->>'expiry_date'); v_branch_name := nullif(btrim(r->>'branch'),''); v_notes := nullif(btrim(r->>'notes'),''); v_branch := null;
    if v_type is null or v_auth is null or v_num is null then insert into public.import_errors(import_job_id,row_number,message,kind) values(job,ln,'نوع الترخيص والجهة والرقم مطلوبة','invalid'); skipped := skipped + 1; continue; end if;
    if v_exp is null or (coalesce(r->>'issue_date','') <> '' and v_issue is null) then insert into public.import_errors(import_job_id,row_number,message,kind) values(job,ln,'تاريخ غير صالح','invalid'); skipped := skipped + 1; continue; end if;
    if v_issue is not null and v_exp < v_issue then insert into public.import_errors(import_job_id,row_number,message,kind) values(job,ln,'تاريخ الانتهاء يسبق تاريخ الإصدار','invalid'); skipped := skipped + 1; continue; end if;
    if v_branch_name is not null then
      select id into v_branch from public.branches where company_id = target_company and active and lower(name_ar) = lower(v_branch_name);
      if v_branch is null then insert into public.import_errors(import_job_id,row_number,message,kind) values(job,ln,'الفرع غير موجود أو غير نشط: '||v_branch_name,'invalid'); skipped := skipped + 1; continue; end if;
    end if;
    if exists(select 1 from public.licenses where company_id = target_company and lower(license_number) = lower(v_num) and expiry_date = v_exp) then
      insert into public.import_errors(import_job_id,row_number,message,kind) values(job,ln,'ترخيص موجود مسبقاً (لم يُستبدل): '||v_num,'duplicate'); skipped := skipped + 1; continue; end if;
    insert into public.licenses(company_id,branch_id,license_type,authority,license_number,issue_date,expiry_date,notes) values(target_company,v_branch,v_type,v_auth,v_num,v_issue,v_exp,v_notes);
    imported := imported + 1;
  end loop;
  update public.import_jobs set status='completed', imported_rows=imported, skipped_rows=skipped where id = job;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value) values(auth.uid(),'import_completed','import_job',job,target_company,jsonb_build_object('type','licenses','imported',imported,'skipped',skipped,'file',left(file_label,200)));
  return jsonb_build_object('job_id',job,'imported',imported,'skipped',skipped);
end $$;

create or replace function public.import_employees(target_company uuid, file_label text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare job uuid; r jsonb; n integer := 0; imported integer := 0; skipped integer := 0; ln integer;
  v_code text; v_name text; v_title text; v_start date; v_branch_name text; v_branch uuid;
begin
  if not public.has_company_role(target_company, array['company_manager','general_manager','system_administrator']::app_role[]) then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.companies where id = target_company and active) then raise exception 'company must exist and be active'; end if;
  if jsonb_typeof(payload) <> 'array' then raise exception 'payload must be an array'; end if;
  if jsonb_array_length(payload) = 0 or jsonb_array_length(payload) > 1000 then raise exception 'an import must contain between 1 and 1000 rows'; end if;
  insert into public.import_jobs(requested_by,status,entity_type,company_id,file_name,total_rows) values(auth.uid(),'running','employees',target_company,left(file_label,200),jsonb_array_length(payload)) returning id into job;
  for r in select * from jsonb_array_elements(payload) loop
    n := n + 1; ln := coalesce((r->>'line')::integer, n + 1);
    v_code := nullif(btrim(r->>'employee_code'),''); v_name := nullif(btrim(r->>'full_name'),''); v_title := nullif(btrim(r->>'job_title'),''); v_start := public.safe_date(r->>'start_date'); v_branch_name := nullif(btrim(r->>'branch'),''); v_branch := null;
    if v_code is null or v_name is null then insert into public.import_errors(import_job_id,row_number,message,kind) values(job,ln,'الرمز الوظيفي والاسم مطلوبان','invalid'); skipped := skipped + 1; continue; end if;
    if coalesce(r->>'start_date','') <> '' and v_start is null then insert into public.import_errors(import_job_id,row_number,message,kind) values(job,ln,'تاريخ المباشرة غير صالح','invalid'); skipped := skipped + 1; continue; end if;
    if v_branch_name is not null then
      select id into v_branch from public.branches where company_id = target_company and active and lower(name_ar) = lower(v_branch_name);
      if v_branch is null then insert into public.import_errors(import_job_id,row_number,message,kind) values(job,ln,'الفرع غير موجود أو غير نشط: '||v_branch_name,'invalid'); skipped := skipped + 1; continue; end if;
    end if;
    if exists(select 1 from public.employees where lower(employee_code) = lower(v_code)) then
      insert into public.import_errors(import_job_id,row_number,message,kind) values(job,ln,'رمز وظيفي موجود مسبقاً (لم يُستبدل): '||v_code,'duplicate'); skipped := skipped + 1; continue; end if;
    insert into public.employees(employee_code,company_id,branch_id,full_name,job_title,employment_status,start_date) values(v_code,target_company,v_branch,v_name,v_title,'active',v_start);
    imported := imported + 1;
  end loop;
  update public.import_jobs set status='completed', imported_rows=imported, skipped_rows=skipped where id = job;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value) values(auth.uid(),'import_completed','import_job',job,target_company,jsonb_build_object('type','employees','imported',imported,'skipped',skipped,'file',left(file_label,200)));
  return jsonb_build_object('job_id',job,'imported',imported,'skipped',skipped);
end $$;

-- Exports are produced in the browser from rows the user can already read under RLS; this records that an export happened.
create or replace function public.log_export(kind text, row_count integer, target_company uuid default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  if kind not in ('licenses','employees','contracts','audit_logs') then raise exception 'unknown export type'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,company_id,after_value) values(auth.uid(),'data_exported','export',target_company,jsonb_build_object('type',kind,'rows',row_count));
end $$;

revoke all on function public.safe_date(text), public.import_licenses(uuid,text,jsonb), public.import_employees(uuid,text,jsonb), public.log_export(text,integer,uuid) from public, anon;
grant execute on function public.safe_date(text), public.import_licenses(uuid,text,jsonb), public.import_employees(uuid,text,jsonb), public.log_export(text,integer,uuid) to authenticated;

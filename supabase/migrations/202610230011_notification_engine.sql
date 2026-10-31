-- Notification engine: configurable thresholds, preferences, idempotent generation, in-app read state,
-- and email delivery bookkeeping. Email statuses never claim delivery: 'accepted_by_provider' means the
-- provider took the message, nothing more.

alter table public.notifications
  add column if not exists title text not null default '',
  add column if not exists body text,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists company_id uuid references public.companies(id),
  add column if not exists in_app boolean not null default true,
  add column if not exists read_at timestamptz,
  add column if not exists email_status text not null default 'not_requested' check (email_status in ('not_requested','pending','accepted_by_provider','failed','skipped_unconfigured')),
  add column if not exists email_attempts integer not null default 0,
  add column if not exists email_last_attempt_at timestamptz,
  add column if not exists email_provider_id text;
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, scheduled_at desc);
create index if not exists notifications_email_queue_idx on public.notifications(email_status) where email_status in ('pending','failed','skipped_unconfigured');

create table public.notification_preferences (
  user_id uuid not null references public.user_profiles(id),
  event_type text not null,
  in_app boolean not null default true,
  email boolean not null default true,
  primary key (user_id, event_type)
);
alter table public.notification_preferences enable row level security;
create policy notification_preferences_own on public.notification_preferences for select using (user_id = auth.uid());

create table public.notification_settings (
  key text primary key check (key in ('license_thresholds_days','contract_thresholds_days','action_due_days')),
  int_values integer[] not null check (cardinality(int_values) between 1 and 8),
  updated_by uuid references public.user_profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
create policy notification_settings_read on public.notification_settings for select using (auth.uid() is not null);
insert into public.notification_settings(key, int_values) values ('license_thresholds_days','{90,60,30,7}'), ('contract_thresholds_days','{30,14,7}'), ('action_due_days','{3}') on conflict do nothing;

create or replace function public.set_notification_thresholds(setting_key text, vals integer[]) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_system_administrator() then raise exception 'not authorized'; end if;
  if vals is null or cardinality(vals) = 0 or exists(select 1 from unnest(vals) v where v is null or v < 1 or v > 365) then raise exception 'thresholds must be whole numbers of days between 1 and 365'; end if;
  update public.notification_settings set int_values = (select array_agg(distinct v order by v desc) from unnest(vals) v), updated_by = auth.uid(), updated_at = now() where key = setting_key;
  if not found then raise exception 'unknown setting'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,after_value) values(auth.uid(),'notification_thresholds_changed','notification_setting',jsonb_build_object('key',setting_key,'values',vals));
end $$;

create or replace function public.set_notification_preference(event text, wants_in_app boolean, wants_email boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  insert into public.notification_preferences(user_id,event_type,in_app,email) values(auth.uid(),event,wants_in_app,wants_email)
  on conflict (user_id,event_type) do update set in_app=excluded.in_app, email=excluded.email;
end $$;

create or replace function public.mark_notification_read(notification_id uuid) returns void
language sql security definer set search_path=public as $$
  update public.notifications set read_at = coalesce(read_at, now()) where id = notification_id and recipient_id = auth.uid();
$$;
create or replace function public.mark_all_notifications_read() returns void
language sql security definer set search_path=public as $$
  update public.notifications set read_at = now() where recipient_id = auth.uid() and read_at is null and in_app and scheduled_at <= now();
$$;

-- Role-aware recipient helpers (internal).
create or replace function public.notification_managers(target_company uuid) returns setof uuid
language sql stable security definer set search_path=public as $$
  select distinct r.user_id from public.user_company_roles r join public.user_profiles p on p.id=r.user_id and p.active
  where r.company_id = target_company and r.role in ('company_manager','general_manager')
$$;

-- The assigned person if there is one, otherwise the company's managers.
create or replace function public.notification_assignee_or_managers(assigned uuid, target_company uuid) returns setof uuid
language sql stable security definer set search_path=public as $$
  select assigned where assigned is not null
  union select public.notification_managers(target_company) where assigned is null
$$;
-- Escalations go to the general manager when one is assigned, otherwise to the company managers.
create or replace function public.notification_escalation_recipients(target_company uuid) returns setof uuid
language sql stable security definer set search_path=public as $$
  select r.user_id from public.user_company_roles r join public.user_profiles p on p.id=r.user_id and p.active where r.company_id=target_company and r.role='general_manager'
  union select public.notification_managers(target_company) where not exists(select 1 from public.user_company_roles r join public.user_profiles p on p.id=r.user_id and p.active where r.company_id=target_company and r.role='general_manager')
$$;

-- Inserts one notification per (recipient, event, entity, bucket). Safe to call repeatedly.
create or replace function public.emit_notification(recipient uuid, event text, entity_kind text, entity uuid, target_company uuid, bucket text, title_text text, body_text text) returns boolean
language plpgsql security definer set search_path=public as $$
declare pref public.notification_preferences; want_in_app boolean; want_email boolean; n integer;
begin
  if recipient is null or not exists(select 1 from public.user_profiles where id=recipient and active) then return false; end if;
  select * into pref from public.notification_preferences where user_id=recipient and event_type=event;
  want_in_app := coalesce(pref.in_app, true); want_email := coalesce(pref.email, true);
  insert into public.notifications(recipient_id,event_type,idempotency_key,scheduled_at,title,body,entity_type,entity_id,company_id,in_app,email_status)
  values(recipient,event,event||':'||entity::text||':'||bucket||':'||recipient::text,now(),title_text,body_text,entity_kind,entity,target_company,want_in_app,case when want_email then 'pending' else 'not_requested' end)
  on conflict (idempotency_key) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.generate_deadline_notifications() returns integer
language plpgsql security definer set search_path=public as $$
declare
  today date := (now() at time zone 'Asia/Riyadh')::date;
  lic_thr integer[]; con_thr integer[]; act_thr integer[]; act_max integer;
  r record; rec record; bucket text; made integer := 0; hours numeric;
begin
  perform pg_advisory_xact_lock(hashtext('generate-deadline-notifications'));
  select int_values into lic_thr from public.notification_settings where key='license_thresholds_days';
  select int_values into con_thr from public.notification_settings where key='contract_thresholds_days';
  select int_values into act_thr from public.notification_settings where key='action_due_days';
  act_max := coalesce((select max(v) from unnest(act_thr) v), 3);

  -- Licenses: current bucket only (smallest threshold not yet passed), or 'expired'. Superseded licenses are skipped.
  for r in select l.id, l.company_id, l.license_type, l.expiry_date, l.verification_owner, (l.expiry_date - today) as days from public.licenses l where l.renewal_status <> 'renewed' loop
    bucket := case when r.days < 0 then 'expired' else (select 'd'||min(t) from unnest(lic_thr) t where r.days <= t) end;
    continue when bucket is null;
    for rec in select u from (select public.notification_managers(r.company_id) as u union select r.verification_owner) s where u is not null loop
      if public.emit_notification(rec.u,'license_expiry','license',r.id,r.company_id,bucket,case when r.days < 0 then 'ترخيص منتهي' else 'ترخيص يقترب من الانتهاء' end, r.license_type||' — تاريخ الانتهاء '||r.expiry_date::text) then made := made + 1; end if;
    end loop;
  end loop;

  -- Contracts: exact-instant buckets; 'critical' is under 24 hours; renewed/closed contracts are skipped.
  for r in select c.id, e.company_id, e.owner_id, e.full_name, c.ends_at, extract(epoch from (c.ends_at - now()))/3600 as hrs from public.contracts c join public.employees e on e.id=c.employee_id where c.status='active' and c.ends_at is not null loop
    hours := r.hrs;
    bucket := case when hours < 0 then 'expired' when hours < 24 then 'critical' else (select 'd'||min(t) from unnest(con_thr) t where hours <= t*24) end;
    continue when bucket is null;
    for rec in select u from (select public.notification_managers(r.company_id) as u union select r.owner_id) s where u is not null loop
      if public.emit_notification(rec.u,case when bucket in ('critical','expired') then 'critical_deadline' else 'contract_expiry' end,'contract',r.id,r.company_id,bucket,case when bucket='expired' then 'عقد منتهي' when bucket='critical' then 'عقد ينتهي خلال أقل من 24 ساعة' else 'عقد يقترب من الانتهاء' end, r.full_name) then made := made + 1; end if;
    end loop;
  end loop;

  -- Overdue inspections: tasks of ended cycles (last 60 days) with no submitted result.
  for r in select t.id, t.company_id, t.assigned_to, i.name from public.inspection_tasks t join public.review_cycles rc on rc.id=t.review_cycle_id join public.compliance_items i on i.id=t.compliance_item_id left join public.compliance_checks c on c.inspection_task_id=t.id where rc.ends_on < today and rc.ends_on >= today - 60 and c.id is null loop
    for rec in select u from public.notification_assignee_or_managers(r.assigned_to, r.company_id) u loop
      if public.emit_notification(rec.u,'overdue_inspection','inspection_task',r.id,r.company_id,'x','فحص أسبوعي متأخر',r.name) then made := made + 1; end if;
    end loop;
  end loop;

  -- Weekly tasks due: assigned, unsubmitted, in the last two days of the current cycle.
  for r in select t.id, t.company_id, t.assigned_to, i.name from public.inspection_tasks t join public.review_cycles rc on rc.id=t.review_cycle_id join public.compliance_items i on i.id=t.compliance_item_id left join public.compliance_checks c on c.inspection_task_id=t.id where rc.starts_on <= today and today <= rc.ends_on and today >= rc.ends_on - 1 and c.id is null and t.assigned_to is not null loop
    if public.emit_notification(r.assigned_to,'weekly_task_due','inspection_task',r.id,r.company_id,'x','فحص أسبوعي يستحق قريباً',r.name) then made := made + 1; end if;
  end loop;

  -- Review decisions in the last 14 days: returned -> the inspector; escalated -> general manager (else company managers).
  for r in select d.id, d.decision, d.reason, c.performed_by, t.company_id, i.name from public.review_decisions d join public.compliance_checks c on c.id=d.compliance_check_id join public.inspection_tasks t on t.id=c.inspection_task_id join public.compliance_items i on i.id=t.compliance_item_id where d.created_at > now() - interval '14 days' and d.decision in ('returned','escalated') loop
    if r.decision = 'returned' then
      if public.emit_notification(r.performed_by,'review_returned','review_decision',r.id,r.company_id,'x','نتيجة تفتيش معادة للتصحيح',r.name||coalesce(' — السبب: '||r.reason,'')) then made := made + 1; end if;
    else
      for rec in select u from public.notification_escalation_recipients(r.company_id) u loop
        if public.emit_notification(rec.u,'finding_escalated','review_decision',r.id,r.company_id,'x','نتيجة تفتيش مصعّدة',r.name) then made := made + 1; end if;
      end loop;
    end if;
  end loop;

  -- New resignation / termination processes in the last 14 days.
  for r in select ev.id, ev.event_type, ev.responsible_id, e.company_id, e.full_name from public.employee_events ev join public.employees e on e.id=ev.employee_id where ev.submitted_at > now() - interval '14 days' loop
    for rec in select u from (select public.notification_managers(r.company_id) as u union select r.responsible_id) s where u is not null loop
      if public.emit_notification(rec.u,'new_resignation','employee_event',r.id,r.company_id,'x',case r.event_type when 'resignation' then 'إجراء استقالة جديد' else 'إجراء إنهاء خدمة جديد' end,r.full_name) then made := made + 1; end if;
    end loop;
  end loop;

  -- Corrective actions: approaching (within the largest configured window) and overdue.
  for r in select a.id, a.title, a.assigned_to, a.status, a.due_at, t.company_id from public.corrective_actions a join public.compliance_checks c on c.id=a.compliance_check_id join public.inspection_tasks t on t.id=c.inspection_task_id where a.status in ('open','in_progress','overdue') and a.due_at is not null loop
    if r.due_at < now() then
      for rec in select u from (select public.notification_managers(r.company_id) as u union select r.assigned_to) s where u is not null loop
        if public.emit_notification(rec.u,'action_overdue','corrective_action',r.id,r.company_id,'overdue','إجراء تصحيحي متأخر',r.title) then made := made + 1; end if;
      end loop;
    elsif r.due_at <= now() + make_interval(days => act_max) then
      for rec in select u from public.notification_assignee_or_managers(r.assigned_to, r.company_id) u loop
        if public.emit_notification(rec.u,'action_due_soon','corrective_action',r.id,r.company_id,'due','إجراء تصحيحي يقترب موعده',r.title) then made := made + 1; end if;
      end loop;
    end if;
  end loop;

  return made;
end $$;

revoke all on function public.set_notification_thresholds(text,integer[]), public.set_notification_preference(text,boolean,boolean), public.mark_notification_read(uuid), public.mark_all_notifications_read(), public.notification_managers(uuid), public.notification_assignee_or_managers(uuid,uuid), public.notification_escalation_recipients(uuid), public.emit_notification(uuid,text,text,uuid,uuid,text,text,text), public.generate_deadline_notifications() from public, anon;
grant execute on function public.set_notification_thresholds(text,integer[]), public.set_notification_preference(text,boolean,boolean), public.mark_notification_read(uuid), public.mark_all_notifications_read() to authenticated;
grant execute on function public.notification_managers(uuid), public.notification_assignee_or_managers(uuid,uuid), public.notification_escalation_recipients(uuid), public.emit_notification(uuid,text,text,uuid,uuid,text,text,text), public.generate_deadline_notifications() to service_role;

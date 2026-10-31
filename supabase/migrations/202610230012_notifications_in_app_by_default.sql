-- Notifications are in-app only by default. Email is sent only to users who explicitly opted in
-- (notification_preferences.email = true) AND only when an email provider is configured.

create or replace function public.emit_notification(recipient uuid, event text, entity_kind text, entity uuid, target_company uuid, bucket text, title_text text, body_text text) returns boolean
language plpgsql security definer set search_path=public as $$
declare pref public.notification_preferences; want_in_app boolean; want_email boolean; n integer;
begin
  if recipient is null or not exists(select 1 from public.user_profiles where id=recipient and active) then return false; end if;
  select * into pref from public.notification_preferences where user_id=recipient and event_type=event;
  want_in_app := coalesce(pref.in_app, true); want_email := coalesce(pref.email, false);
  insert into public.notifications(recipient_id,event_type,idempotency_key,scheduled_at,title,body,entity_type,entity_id,company_id,in_app,email_status)
  values(recipient,event,event||':'||entity::text||':'||bucket||':'||recipient::text,now(),title_text,body_text,entity_kind,entity,target_company,want_in_app,case when want_email then 'pending' else 'not_requested' end)
  on conflict (idempotency_key) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Stop any email already queued for users who never opted in.
update public.notifications n set email_status = 'not_requested'
where n.email_status in ('pending','skipped_unconfigured')
  and not exists (select 1 from public.notification_preferences p where p.user_id = n.recipient_id and p.event_type = n.event_type and p.email);

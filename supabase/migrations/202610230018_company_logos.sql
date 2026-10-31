-- Company logos. Same model as profile pictures: a PRIVATE bucket no client role can touch directly (no storage.objects
-- policies); the server validates the bytes and uploads with the service role AFTER checking the caller administers the
-- company, then registers the path through set_company_logo, which authorizes again.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', false, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/png','image/jpeg','image/webp'];

alter table public.companies add column if not exists logo_path text;

-- Sets (or clears, with null) a company's logo. Returns the previous path so the server can delete the old file.
create or replace function public.set_company_logo(target_company uuid, new_path text) returns text
language plpgsql security definer set search_path=public as $$
declare old_path text;
begin
  if not public.is_admin_of(target_company) then raise exception 'not authorized'; end if;
  if new_path is not null and new_path !~ ('^' || target_company::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$') then raise exception 'invalid storage path'; end if;
  select logo_path into old_path from public.companies where id = target_company for update;
  if not found then raise exception 'company not found'; end if;
  update public.companies set logo_path = new_path, updated_at = now() where id = target_company;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'company_updated','company',target_company,target_company,jsonb_build_object('logo', case when new_path is null then 'removed' else 'changed' end));
  return old_path;
end $$;

revoke all on function public.set_company_logo(uuid,text) from public, anon;
grant execute on function public.set_company_logo(uuid,text) to authenticated;

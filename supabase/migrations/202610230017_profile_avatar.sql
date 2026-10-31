-- Profile pictures. Private bucket, small files, images only. No storage.objects policies exist, so no client role
-- can touch it directly: the server validates the bytes and uploads with the service role, then registers the path
-- through set_own_avatar, which only ever writes the caller's own row.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/png','image/jpeg','image/webp'];

alter table public.user_profiles add column if not exists avatar_path text;

-- Sets (or clears, with null) the caller's avatar. Returns the previous path so the server can delete the old file.
create or replace function public.set_own_avatar(new_path text) returns text
language plpgsql security definer set search_path=public as $$
declare old_path text; company uuid;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  if new_path is not null and new_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$') then raise exception 'invalid storage path'; end if;
  select avatar_path into old_path from public.user_profiles where id = auth.uid() and active for update;
  if not found then raise exception 'not authorized'; end if;
  update public.user_profiles set avatar_path = new_path where id = auth.uid();
  select company_id into company from public.user_company_roles where user_id = auth.uid() limit 1;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,after_value)
  values(auth.uid(),'profile_updated','user',auth.uid(),company,jsonb_build_object('avatar', case when new_path is null then 'removed' else 'changed' end));
  return old_path;
end $$;

revoke all on function public.set_own_avatar(text) from public, anon;
grant execute on function public.set_own_avatar(text) to authenticated;

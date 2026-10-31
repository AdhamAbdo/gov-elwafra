-- Self-service profile: a signed-in, active user may change ONLY their own display name.
-- user_profiles has no update policy on purpose (roles and the active flag are admin-only), so the change goes
-- through this function, which touches display_name and nothing else.

create or replace function public.update_own_profile(new_display_name text) returns void
language plpgsql security definer set search_path=public as $$
declare cleaned text := btrim(coalesce(new_display_name,'')); old_name text; company uuid;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  if char_length(cleaned) < 2 or char_length(cleaned) > 120 then raise exception 'display name must be between 2 and 120 characters'; end if;
  select display_name into old_name from public.user_profiles where id = auth.uid() and active;
  if not found then raise exception 'not authorized'; end if;
  if old_name = cleaned then return; end if;
  update public.user_profiles set display_name = cleaned where id = auth.uid();
  select company_id into company from public.user_company_roles where user_id = auth.uid() limit 1;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,company_id,before_value,after_value)
  values(auth.uid(),'profile_updated','user',auth.uid(),company,jsonb_build_object('display_name',old_name),jsonb_build_object('display_name',cleaned));
end $$;

revoke all on function public.update_own_profile(text) from public, anon;
grant execute on function public.update_own_profile(text) to authenticated;

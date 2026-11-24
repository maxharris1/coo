create function public.sms_phone(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.phone from auth.users u where u.id = p_user
$$;

revoke all on function public.sms_phone(uuid) from public;

-- Supabase's default privileges grant anon and authenticated execute on new public functions.
do $$ begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.sms_phone(uuid) from anon;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on function public.sms_phone(uuid) from authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'coo_app') then
    grant execute on function public.sms_phone(uuid) to coo_app;
  end if;
end $$;

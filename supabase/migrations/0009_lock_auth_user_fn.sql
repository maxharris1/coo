create function public.lock_auth_user(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from auth.users where id = p_user for key share;
  return found;
end
$$;

revoke all on function public.lock_auth_user(uuid) from public;

-- Supabase's default privileges grant anon and authenticated execute on new public functions.
do $$ begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.lock_auth_user(uuid) from anon;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on function public.lock_auth_user(uuid) from authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'coo_app') then
    grant execute on function public.lock_auth_user(uuid) to coo_app;
  end if;
end $$;

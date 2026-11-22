create function public.sync_phone_last4(p_user uuid)
returns setof public.profiles
language sql
security definer
set search_path = ''
as $$
  update public.profiles p
     set phone_last4 = pg_catalog.right(pg_catalog.regexp_replace(u.phone, '\D', '', 'g'), 4)
    from auth.users u
   where p.id = p_user and u.id = p.id
     and p.phone_last4 is distinct from pg_catalog.right(pg_catalog.regexp_replace(u.phone, '\D', '', 'g'), 4)
  returning p.*
$$;

revoke all on function public.sync_phone_last4(uuid) from public;

-- Supabase's default privileges grant anon and authenticated execute on new public functions.
do $$ begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.sync_phone_last4(uuid) from anon;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on function public.sync_phone_last4(uuid) from authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'coo_app') then
    grant execute on function public.sync_phone_last4(uuid) to coo_app;
  end if;
end $$;

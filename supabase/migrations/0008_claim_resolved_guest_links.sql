create or replace function public.guest_links_for_phone(p_user uuid)
returns table (id uuid, sender_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select gl.id, gl.sender_id
    from public.guest_links gl
    join auth.users u on u.id = p_user
   where gl.status = 'active'
     and gl.claimed_by is null
     and (gl.expires_at is null or gl.expires_at > pg_catalog.now())
     and gl.sender_id <> p_user
     and pg_catalog.regexp_replace(u.phone, '\D', '', 'g') ~ '^[1-9][0-9]{7,14}$'
     and pg_catalog.regexp_replace(gl.notify_phone, '\D', '', 'g')
       = pg_catalog.regexp_replace(u.phone, '\D', '', 'g')
$$;

revoke all on function public.guest_links_for_phone(uuid) from public;

-- Supabase's default privileges grant anon and authenticated execute on new public functions.
do $$ begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.guest_links_for_phone(uuid) from anon;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on function public.guest_links_for_phone(uuid) from authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'coo_app') then
    grant execute on function public.guest_links_for_phone(uuid) to coo_app;
  end if;
end $$;

create temp table claim_matches (link_id uuid primary key, sender_id uuid not null, claimer_id uuid not null);

insert into claim_matches (link_id, sender_id, claimer_id)
select m.link_id, m.sender_id, m.claimer_id
  from (select l.id as link_id, l.sender_id, (array_agg(p.id))[1] as claimer_id
          from profiles p cross join lateral public.guest_links_for_phone(p.id) l
         group by l.id, l.sender_id
        having count(*) = 1) m
 where not exists (
         select from friendships f
          where f.status = 'blocked'
            and f.a_id = least(m.sender_id, m.claimer_id)
            and f.b_id = greatest(m.sender_id, m.claimer_id));

insert into friendships (a_id, b_id, via, created_at)
select distinct least(sender_id, claimer_id), greatest(sender_id, claimer_id), 'guest_link', now()
  from claim_matches
on conflict do nothing;

update guest_links gl set status = 'claimed', claimed_by = m.claimer_id, claimed_at = now()
  from claim_matches m
 where gl.id = m.link_id and gl.status = 'active';

insert into claim_matches (link_id, sender_id, claimer_id)
select gl.id, gl.sender_id, (array_agg(p.id))[1]
  from guest_links gl
  join friendships f on f.status = 'accepted' and gl.sender_id in (f.a_id, f.b_id)
  join profiles p on p.id = case when f.a_id = gl.sender_id then f.b_id else f.a_id end
                 and lower(trim(p.name)) = lower(trim(gl.recipient_name))
 where gl.status = 'active'
   and gl.claimed_by is null
   and gl.notify_phone is null
   and (gl.expires_at is null or gl.expires_at > now())
   and (select count(*) from guest_links o
         where o.sender_id = gl.sender_id and o.status = 'active'
           and lower(trim(o.recipient_name)) = lower(trim(gl.recipient_name))) = 1
 group by gl.id, gl.sender_id
having count(*) = 1
on conflict do nothing;

update guest_links gl set status = 'claimed', claimed_by = m.claimer_id, claimed_at = now()
  from claim_matches m
 where gl.id = m.link_id and gl.status = 'active';

update flights f set counterpart_id = m.claimer_id
  from claim_matches m
 where f.guest_link_id = m.link_id and f.kind = 'delivery';

update notes n set recipient_id = m.claimer_id
  from flights f join claim_matches m on m.link_id = f.guest_link_id
 where f.kind = 'delivery' and n.id = f.note_id;

update visits v set host_id = m.claimer_id
  from claim_matches m
 where v.guest_link_id = m.link_id and v.status = 'waiting' and v.leaves_at > now();

insert into bird_meetings (user_id, bird_id, first_at)
select distinct m.claimer_id, f.bird_id, now()
  from flights f join claim_matches m on m.link_id = f.guest_link_id
 where f.kind = 'delivery'
on conflict (user_id, bird_id) do nothing;

drop table claim_matches;

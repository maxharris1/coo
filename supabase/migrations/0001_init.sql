-- Coo: initial schema.
-- Source of truth for the database. docs/03-data-model.md explains every table.
-- Access model: browsers never query these tables. All reads and writes go through the Next.js
-- server, which connects as the database owner. Row level security is enabled everywhere as a
-- second lock; the only policy is read-your-own on `events`, which the Realtime nudge needs.

-- ------------------------------------------------------------------ people
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  handle text not null unique check (handle ~ '^[a-z0-9_]{2,20}$'),
  invite_code text not null unique,
  phone_last4 text,
  timezone text not null default 'America/New_York',
  units text not null default 'mi' check (units in ('mi', 'km')),
  seeds integer not null default 0 check (seeds >= 0),
  perches smallint not null default 3 check (perches between 3 and 5),
  has_birdbath boolean not null default false,
  deliveries_count integer not null default 0,
  -- Home loft. Coordinates are already snapped to the roost grid before they are stored.
  home_lat double precision, home_lon double precision, home_label text,
  home_city text, home_city_lat double precision, home_city_lon double precision,
  -- Travel switch. When on, these replace the home loft for new flights.
  travel_on boolean not null default false,
  travel_lat double precision, travel_lon double precision, travel_label text,
  travel_city text, travel_city_lat double precision, travel_city_lon double precision,
  travel_changed_at timestamptz,
  notify_landed_in boolean not null default true,
  notify_landed_out boolean not null default true,
  notify_delays boolean not null default true,
  notify_hungry boolean not null default true,
  quiet_on boolean not null default true,
  quiet_start smallint not null default 22 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 7 check (quiet_end between 0 and 23),
  sms_fallback boolean not null default true,
  installed boolean not null default false,
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table friendships (
  a_id uuid not null references profiles (id) on delete cascade,
  b_id uuid not null references profiles (id) on delete cascade,
  status text not null default 'accepted' check (status in ('accepted', 'blocked')),
  blocked_by uuid references profiles (id) on delete set null,
  a_shows text not null default 'block' check (a_shows in ('block', 'city')),  -- what a lets b see
  b_shows text not null default 'block' check (b_shows in ('block', 'city')),  -- what b lets a see
  via text not null default 'invite' check (via in ('invite', 'guest_link')),
  created_at timestamptz not null default now(),
  primary key (a_id, b_id),
  check (a_id < b_id)
);
create index friendships_b_idx on friendships (b_id);

-- ------------------------------------------------------------------ birds and gear
create table birds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  breed text not null default 'city' check (breed in ('city', 'fantail', 'pouter', 'frillback', 'jacobin', 'king', 'tumbler')),
  look text not null default 'gerald',
  pronoun text not null default 'they' check (pronoun in ('he', 'she', 'they')),
  speed_mph numeric(5, 1) not null check (speed_mph between 20 and 80),
  focus smallint not null check (focus between 1 and 5),
  navigation smallint not null check (navigation between 1 and 5),
  quirks text[] not null default '{}',
  miles numeric(10, 1) not null default 0,
  deliveries integer not null default 0,
  detours integer not null default 0,
  -- Care values as of care_at. Current values are computed, never ticked (docs/04-game-rules.md).
  belly numeric(5, 1) not null default 80 check (belly between 0 and 100),
  feathers numeric(5, 1) not null default 80 check (feathers between 0 and 100),
  energy numeric(5, 1) not null default 100 check (energy between 0 and 100),
  care_at timestamptz not null default now(),
  last_fed_at timestamptz not null default now(),
  hungry_notified boolean not null default false,
  status text not null default 'home' check (status in ('home', 'scheduled', 'flying', 'visiting', 'busy')),
  busy_kind text check (busy_kind in ('nap', 'bath', 'job')),
  busy_until timestamptz,
  gear text[] not null default '{}',
  hatched_at timestamptz not null default now(),
  check ((status = 'busy') = (busy_kind is not null and busy_until is not null))
);
create index birds_owner_idx on birds (owner_id);
create index birds_busy_idx on birds (busy_until) where status = 'busy';

create table gear_owned (
  user_id uuid not null references profiles (id) on delete cascade,
  gear_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, gear_id)
);

create table outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  items text[] not null default '{}',
  position smallint not null default 0
);
create index outfits_user_idx on outfits (user_id);

-- ------------------------------------------------------------------ guest links
create table guest_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,              -- sha256 hex of the secret part of the link
  sender_id uuid not null references profiles (id) on delete cascade,
  recipient_name text not null check (char_length(recipient_name) between 1 and 30),
  dest_lat double precision not null, dest_lon double precision not null, dest_label text not null,
  notify_phone text,                            -- E.164. Used for one landing text, then cleared.
  status text not null default 'active' check (status in ('active', 'claimed', 'expired', 'reported')),
  opened_at timestamptz,
  expires_at timestamptz,                       -- set when the bird lands: landing time plus 7 days
  claimed_by uuid references profiles (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index guest_links_sender_idx on guest_links (sender_id, created_at);
create index guest_links_expiry_idx on guest_links (expires_at) where status = 'active';

-- ------------------------------------------------------------------ notes and flights
create table notes (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles (id) on delete cascade,
  recipient_id uuid references profiles (id) on delete set null,
  guest_link_id uuid references guest_links (id) on delete set null,
  body text not null check (char_length(body) between 1 and 560),
  reply_to uuid references notes (id) on delete set null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  returned_at timestamptz                       -- guest link expired unopened: note came back
);
create index notes_sender_idx on notes (sender_id, created_at desc);
create index notes_recipient_idx on notes (recipient_id, delivered_at desc);

create table flights (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('delivery', 'return')),
  bird_id uuid not null references birds (id) on delete cascade,
  owner_id uuid not null references profiles (id) on delete cascade,      -- the bird's owner
  counterpart_id uuid references profiles (id) on delete set null,        -- recipient (delivery) or host (return)
  guest_link_id uuid references guest_links (id) on delete set null,
  note_id uuid references notes (id) on delete set null,                  -- null for an empty return
  from_lat double precision not null, from_lon double precision not null, from_label text not null,
  to_lat double precision not null, to_lon double precision not null, to_label text not null,
  status text not null check (status in ('scheduled', 'flying', 'landed', 'cancelled')),
  release_at timestamptz not null,              -- when the bird leaves (now, or a scheduled time)
  arrive_at timestamptz,                        -- from the plan. Null while scheduled.
  distance_mi numeric(8, 2),
  odds numeric(3, 2),
  delay_kind text check (delay_kind in ('none', 'minor', 'major')),
  input jsonb,                                  -- exact FlightInput given to the engine
  plan jsonb,                                   -- exact FlightPlan the engine returned
  place_names jsonb not null default '{}',      -- event index to place name, for the flight log
  search_party text check (search_party in ('found', 'not_found')),
  delay_notified boolean not null default false,
  roosts_notified smallint not null default 0,
  created_at timestamptz not null default now(),
  landed_at timestamptz
);
create index flights_due_idx on flights (arrive_at) where status = 'flying';
create index flights_release_idx on flights (release_at) where status = 'scheduled';
create index flights_owner_idx on flights (owner_id, created_at desc);
create index flights_counterpart_idx on flights (counterpart_id, created_at desc);
create unique index flights_one_active_per_bird on flights (bird_id) where status in ('scheduled', 'flying');

-- A bird sitting on someone's sill after a delivery.
create table visits (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid not null unique references flights (id) on delete cascade,
  bird_id uuid not null references birds (id) on delete cascade,
  host_id uuid references profiles (id) on delete cascade,                -- null while the host is a guest
  guest_link_id uuid references guest_links (id) on delete set null,
  note_id uuid references notes (id) on delete set null,
  arrived_at timestamptz not null,
  leaves_at timestamptz not null,
  status text not null default 'waiting' check (status in ('waiting', 'replied', 'left')),
  snack_given boolean not null default false,
  return_flight_id uuid references flights (id) on delete set null
);
create index visits_due_idx on visits (leaves_at) where status = 'waiting';
create index visits_host_idx on visits (host_id, arrived_at desc);

-- ------------------------------------------------------------------ seeds
create table seed_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);
-- One entry per (user, reason, thing). This is what makes awards safe to retry.
create unique index seed_ledger_once on seed_ledger (user_id, reason, ref_id) where ref_id is not null;
create index seed_ledger_user_idx on seed_ledger (user_id, created_at desc);

-- Adds or spends seeds. Returns the new balance. A repeat call with the same (user, reason, ref)
-- changes nothing and returns the current balance. Spending more than the balance raises
-- 'insufficient_seeds'. Call it inside the transaction that does the thing being paid for.
create function apply_seeds(p_user uuid, p_delta integer, p_reason text, p_ref uuid default null)
returns integer language plpgsql as $$
declare
  v_balance integer;
  v_inserted bigint;
begin
  select seeds into v_balance from profiles where id = p_user for update;
  if not found then raise exception 'no_such_user'; end if;
  if v_balance + p_delta < 0 then raise exception 'insufficient_seeds'; end if;
  insert into seed_ledger (user_id, delta, reason, ref_id) values (p_user, p_delta, p_reason, p_ref)
    on conflict (user_id, reason, ref_id) where ref_id is not null do nothing
    returning id into v_inserted;
  if v_inserted is null then return v_balance; end if;
  update profiles set seeds = seeds + p_delta where id = p_user returning seeds into v_balance;
  return v_balance;
end $$;

create table punch_cards (
  user_id uuid not null references profiles (id) on delete cascade,
  week_start date not null,                     -- Monday, in the owner's time zone
  deliveries smallint not null default 0,
  paid boolean not null default false,
  primary key (user_id, week_start)
);

-- ------------------------------------------------------------------ earning, collecting, hatching
create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  bird_id uuid not null references birds (id) on delete cascade,
  job_id text not null,
  pay integer not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'running' check (status in ('running', 'done'))
);
create index jobs_due_idx on jobs (ends_at) where status = 'running';
create index jobs_user_idx on jobs (user_id, started_at desc);

create table found_objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  bird_id uuid references birds (id) on delete set null,
  object_id text not null,
  value integer not null,
  source_id uuid not null,                      -- the job or flight that found it
  found_at timestamptz not null default now(),
  traded_at timestamptz,
  unique (source_id)
);
create index found_objects_user_idx on found_objects (user_id) where traded_at is null;

create table postmarks (
  user_id uuid not null references profiles (id) on delete cascade,
  place_key text not null,                      -- lower-case 'city|region|country'
  city text not null, region text, country text,
  flight_id uuid references flights (id) on delete set null,
  earned_at timestamptz not null default now(),
  primary key (user_id, place_key)
);

create table badges (
  user_id uuid not null references profiles (id) on delete cascade,
  badge_id text not null,
  progress integer not null default 0,
  earned_at timestamptz,
  primary key (user_id, badge_id)
);

create table bird_meetings (
  user_id uuid not null references profiles (id) on delete cascade,
  bird_id uuid not null references birds (id) on delete cascade,
  first_at timestamptz not null default now(),
  primary key (user_id, bird_id)
);

create table eggs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  hatch_at_delivery integer not null,           -- hatches when profiles.deliveries_count reaches this
  status text not null default 'incubating' check (status in ('incubating', 'ready', 'hatched')),
  bird_id uuid references birds (id) on delete set null,
  laid_at timestamptz not null default now(),
  hatched_at timestamptz
);
create unique index eggs_one_open_per_user on eggs (user_id) where status <> 'hatched';

-- ------------------------------------------------------------------ notifications
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  url text not null default '/',
  ref_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_sent_at timestamptz,
  sms_sent_at timestamptz
);
create unique index notifications_once on notifications (user_id, kind, ref_id) where ref_id is not null;
create index notifications_user_idx on notifications (user_id, created_at desc);

-- Tiny rows that tell an open app "something changed, call /api/sync". Carries no content.
create table events (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index events_created_idx on events (created_at);

-- ------------------------------------------------------------------ safety and plumbing
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles (id) on delete set null,
  target_user_id uuid references profiles (id) on delete set null,
  guest_link_id uuid references guest_links (id) on delete set null,
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create table geo_cache (
  key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

create table weather_cache (
  cell text not null,                           -- 'lat,lon' rounded to 0.1 degree
  hour timestamptz not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (cell, hour)
);

-- Test clock. One row. Production code refuses to read a non-zero offset.
create table dev_clock (
  id boolean primary key default true check (id),
  offset_ms bigint not null default 0
);
insert into dev_clock default values;

-- ------------------------------------------------------------------ row level security
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy events_read_own on events for select to authenticated using (user_id = (select auth.uid()));
grant select on events to authenticated;
alter publication supabase_realtime add table events;

-- Coo: bug reports sent from the app, kept for triage.
create table bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  client_key uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 2048),
  status text not null default 'new'
    check (status in ('new', 'triaged', 'duplicate', 'wontfix')),
  issue_number integer check (issue_number > 0),
  triaged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, client_key),
  check ((status = 'new') = (triaged_at is null)),
  check (issue_number is null or status <> 'new')
);
create index bug_reports_new_idx on bug_reports (created_at) where status = 'new';

alter table bug_reports enable row level security;

-- Supabase's default privileges grant anon and authenticated access to new public tables.
do $$ begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on bug_reports from anon;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on bug_reports from authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'coo_app') then
    grant select, insert on bug_reports to coo_app;
    create policy bug_reports_app_read on bug_reports for select to coo_app using (true);
    create policy bug_reports_app_insert on bug_reports for insert to coo_app with check (true);
    revoke update, delete on bug_reports from coo_app;
  end if;
end $$;

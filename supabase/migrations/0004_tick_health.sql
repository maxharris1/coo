-- Coo: when the minute tick last finished, read by GET /api/health. One row.
create table tick_health (
  id boolean primary key default true check (id),
  last_ok_at timestamptz
);
insert into tick_health default values;

alter table tick_health enable row level security;

-- The server connects as coo_app, which may not own this table or bypass row level security.
do $$ begin
  if exists (select from pg_roles where rolname = 'coo_app') then
    grant select, update on tick_health to coo_app;
    create policy tick_health_app on tick_health for all to coo_app using (true) with check (true);
  end if;
end $$;

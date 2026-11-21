-- Coo: when the minute tick last finished, read by GET /api/health. One row.
create table tick_health (
  id boolean primary key default true check (id),
  last_ok_at timestamptz
);
insert into tick_health default values;

alter table tick_health enable row level security;

alter table profiles
  add column espresso_shots integer not null default 0 check (espresso_shots >= 0);

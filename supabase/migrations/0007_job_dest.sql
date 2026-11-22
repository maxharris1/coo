alter table jobs
  add column dest_lat double precision,
  add column dest_lon double precision,
  add column dest_label text;

alter table jobs add constraint jobs_dest_check
  check (
    (dest_lat is null and dest_lon is null and dest_label is null)
    or (dest_lat is not null and dest_lon is not null and dest_label is not null)
  );

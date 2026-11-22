alter table notes add column doodle jsonb;

alter table notes drop constraint notes_body_check;
alter table notes add constraint notes_body_check
  check (char_length(body) between 0 and 560 and (char_length(body) >= 1 or doodle is not null));

alter table notes add constraint notes_doodle_check
  check (doodle is null or (jsonb_typeof(doodle) = 'object' and octet_length(doodle::text) <= 65536));

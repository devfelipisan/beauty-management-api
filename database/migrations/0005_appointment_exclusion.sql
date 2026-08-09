begin;

alter table app.appointments
  drop constraint if exists appointments_no_professional_overlap;

alter table app.appointments
  add constraint appointments_no_professional_overlap
  exclude using gist (
    tenant_id with =,
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('awaiting_deposit','awaiting_confirmation','confirmed','checked_in','in_progress'));

commit;

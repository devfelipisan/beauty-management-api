begin;

-- Keep the compact fixture scenarios from 0001 while moving the one future
-- Ink Studio active slot outside the generated high-volume active window.
-- This preserves the appointment exclusion constraint during seeding.
update app.appointments
set starts_at = '2026-08-10T18:00:00Z'::timestamptz,
    ends_at = '2026-08-10T20:00:00Z'::timestamptz,
    updated_at = '2026-08-10T12:00:00Z'::timestamptz
where id = '70000000-0000-0000-0000-000000000006'
  and tenant_id = '10000000-0000-0000-0000-000000000002';

commit;

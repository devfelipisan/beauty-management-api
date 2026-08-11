begin;

insert into identity.professional_memberships (tenant_id, membership_id, professional_id, created_at)
values (
  '10000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000001',
  '2026-08-01T12:00:00Z'
)
on conflict (tenant_id, membership_id) do update
set professional_id = excluded.professional_id;

commit;

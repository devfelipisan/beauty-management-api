begin;

create table if not exists identity.professional_memberships (
  tenant_id uuid not null,
  membership_id uuid not null,
  professional_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, membership_id),
  unique (tenant_id, professional_id),
  foreign key (tenant_id, membership_id)
    references identity.tenant_memberships(tenant_id, id)
    on delete cascade,
  foreign key (tenant_id, professional_id)
    references app.professionals(tenant_id, id)
    on delete cascade
);

create index if not exists professional_memberships_professional_idx
  on identity.professional_memberships (tenant_id, professional_id);

-- Identity tables are backend-owned. Tenant resolution must still occur through
-- membership lookup before app.tenant_id is set for tenant-scoped repositories.

commit;

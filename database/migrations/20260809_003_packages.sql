begin;

create table if not exists app.customer_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  customer_id uuid not null,
  service_id uuid not null,
  total_sessions integer not null check (total_sessions > 0 and total_sessions <= 1000),
  used_sessions integer not null default 0 check (used_sessions >= 0),
  valid_until timestamptz,
  status text not null default 'active' check (status in ('active','expired','exhausted','canceled')),
  price_cents bigint check (price_cents is null or price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references app.customers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, service_id) references app.services(tenant_id, id) on delete restrict,
  check (used_sessions <= total_sessions)
);

create index if not exists customer_packages_tenant_customer_idx
  on app.customer_packages (tenant_id, customer_id, created_at desc);
create index if not exists customer_packages_tenant_status_idx
  on app.customer_packages (tenant_id, status, valid_until);

create table if not exists app.package_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  package_id uuid not null,
  session_id uuid,
  quantity integer not null check (quantity > 0),
  movement_type text not null check (movement_type in ('consume','reverse','adjust')),
  reason text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, package_id) references app.customer_packages(tenant_id, id) on delete restrict,
  foreign key (tenant_id, session_id) references app.sessions(tenant_id, id) on delete restrict
);

create index if not exists package_movements_tenant_package_idx
  on app.package_movements (tenant_id, package_id, created_at desc);

alter table app.customer_packages enable row level security;
alter table app.customer_packages force row level security;
alter table app.package_movements enable row level security;
alter table app.package_movements force row level security;

drop policy if exists customer_packages_tenant_policy on app.customer_packages;
create policy customer_packages_tenant_policy on app.customer_packages
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists package_movements_tenant_policy on app.package_movements;
create policy package_movements_tenant_policy on app.package_movements
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

insert into identity.permissions (code, description) values
  ('package:read', 'Read customer packages'),
  ('package:create', 'Create customer packages'),
  ('package:manage', 'Manage and consume customer packages')
on conflict (code) do update set description = excluded.description;

insert into identity.role_permissions (role_id, permission_code)
select r.id, p.code
from identity.roles r
join identity.permissions p on p.code in ('package:read','package:create','package:manage')
where (r.tenant_id is null and r.code = 'platform_admin')
   or (r.tenant_id is not null and r.code = 'tenant_admin')
on conflict do nothing;

insert into identity.role_permissions (role_id, permission_code)
select r.id, p.code
from identity.roles r
join identity.permissions p on p.code in ('package:read','package:create')
where r.tenant_id is not null and r.code = 'reception'
on conflict do nothing;

insert into identity.role_permissions (role_id, permission_code)
select r.id, 'package:read'
from identity.roles r
where r.tenant_id is not null and r.code = 'professional'
on conflict do nothing;

commit;

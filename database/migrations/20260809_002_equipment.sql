begin;

create table if not exists app.equipment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  name text not null,
  model text,
  manufacturer text,
  serial_number text,
  primary_unit text,
  status text not null default 'available' check (status in ('available','maintenance','blocked','inactive')),
  notes text,
  last_used_at timestamptz,
  usage_count integer not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create unique index if not exists equipment_tenant_serial_uq
  on app.equipment (tenant_id, lower(serial_number))
  where serial_number is not null and btrim(serial_number) <> '';

create table if not exists app.equipment_services (
  tenant_id uuid not null,
  equipment_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, equipment_id, service_id),
  foreign key (tenant_id, equipment_id) references app.equipment(tenant_id, id) on delete cascade,
  foreign key (tenant_id, service_id) references app.services(tenant_id, id) on delete restrict
);

create index if not exists equipment_tenant_status_idx on app.equipment (tenant_id, status, name);

alter table app.equipment enable row level security;
alter table app.equipment force row level security;
alter table app.equipment_services enable row level security;
alter table app.equipment_services force row level security;

drop policy if exists equipment_tenant_policy on app.equipment;
create policy equipment_tenant_policy on app.equipment
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists equipment_services_tenant_policy on app.equipment_services;
create policy equipment_services_tenant_policy on app.equipment_services
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

insert into identity.permissions (code, description) values
  ('equipment:read', 'Read tenant equipment'),
  ('equipment:create', 'Create tenant equipment'),
  ('equipment:manage', 'Manage tenant equipment')
on conflict (code) do update set description = excluded.description;

insert into identity.role_permissions (role_id, permission_code)
select r.id, p.code
from identity.roles r
join identity.permissions p on p.code in ('equipment:read','equipment:create','equipment:manage')
where (r.tenant_id is null and r.code = 'platform_admin')
   or (r.tenant_id is not null and r.code = 'tenant_admin')
on conflict do nothing;

insert into identity.role_permissions (role_id, permission_code)
select r.id, 'equipment:read'
from identity.roles r
where r.tenant_id is not null and r.code in ('reception','professional')
on conflict do nothing;

commit;

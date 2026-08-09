begin;

create table if not exists identity.users (
  id uuid primary key default gen_random_uuid(),
  auth_subject uuid not null unique,
  full_name text not null,
  email text not null,
  status text not null default 'active' check (status in ('invited','active','suspended','revoked')),
  created_at timestamptz not null default now()
);

create table if not exists identity.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  user_id uuid not null references identity.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active','inactive','suspended')),
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, user_id)
);

create table if not exists identity.permissions (
  code text primary key,
  description text not null
);

create table if not exists identity.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references app.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  system_role boolean not null default false,
  unique nulls not distinct (tenant_id, code),
  unique (tenant_id, id)
);

create table if not exists identity.role_permissions (
  role_id uuid not null references identity.roles(id) on delete cascade,
  permission_code text not null references identity.permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

create table if not exists identity.membership_roles (
  tenant_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  primary key (tenant_id, membership_id, role_id),
  foreign key (tenant_id, membership_id) references identity.tenant_memberships(tenant_id, id) on delete cascade,
  foreign key (tenant_id, role_id) references identity.roles(tenant_id, id) on delete cascade
);

create table if not exists identity.platform_user_roles (
  user_id uuid not null references identity.users(id) on delete cascade,
  role_id uuid not null references identity.roles(id) on delete cascade,
  primary key (user_id, role_id)
);

insert into identity.permissions (code, description) values
  ('platform:tenant:create', 'Create tenants at platform scope'),
  ('tenant:read', 'Read tenant information'),
  ('tenant:update', 'Update tenant information'),
  ('tenant-branding:update', 'Update tenant branding'),
  ('professional:read', 'Read professionals'),
  ('professional:create', 'Create professionals'),
  ('professional:manage', 'Manage professionals'),
  ('service:read', 'Read services'),
  ('service:create', 'Create services'),
  ('service:manage', 'Manage services'),
  ('customer:read', 'Read customers'),
  ('customer:create', 'Create customers'),
  ('customer:update', 'Update customers'),
  ('appointment:read', 'Read appointments'),
  ('appointment:create', 'Create appointments'),
  ('appointment:reschedule', 'Reschedule appointments'),
  ('appointment:cancel', 'Cancel appointments'),
  ('appointment:check-in', 'Check in appointments'),
  ('deposit:confirm', 'Confirm appointment deposits'),
  ('session:start', 'Start sessions'),
  ('session:complete', 'Complete sessions'),
  ('payment:read', 'Read payments'),
  ('payment:create', 'Register payments'),
  ('audit:read', 'Read tenant audit trail'),
  ('user:manage', 'Manage tenant users'),
  ('role:manage', 'Manage tenant roles')
on conflict (code) do update set description = excluded.description;

insert into identity.roles (tenant_id, code, name, system_role)
values (null, 'platform_admin', 'Platform administrator', true)
on conflict (tenant_id, code) do nothing;

insert into identity.role_permissions (role_id, permission_code)
select r.id, p.code
from identity.roles r
join identity.permissions p on true
where r.tenant_id is null and r.code = 'platform_admin'
on conflict do nothing;

commit;

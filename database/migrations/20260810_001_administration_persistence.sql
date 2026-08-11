begin;

create table if not exists app.tenant_users (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  full_name text not null,
  email text not null,
  phone text,
  profile text not null check (profile in ('administrator','reception','professional')),
  status text not null check (status in ('active','inactive')),
  last_access_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (tenant_id, id)
);
create unique index if not exists tenant_users_tenant_email_uq on app.tenant_users (tenant_id, lower(email));

create table if not exists app.relationship_profile_configs (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  profile text not null check (profile in ('new','returning','loyal','inactive','frequent_no_show')),
  minimum_completed_appointments integer,
  period_months integer,
  maximum_no_shows integer,
  inactive_after_days integer,
  manual_override_allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, profile)
);

create table if not exists app.discount_policies (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  name text not null,
  profile text not null check (profile in ('new','returning','loyal','inactive','frequent_no_show')),
  type text not null check (type in ('percentage','fixed','restriction')),
  status text not null check (status in ('active','inactive')),
  percentage numeric,
  fixed_amount_cents bigint,
  eligible_service_ids uuid[],
  eligible_categories text[],
  eligible_package_ids uuid[],
  minimum_amount_cents bigint,
  maximum_discount_cents bigint,
  valid_from timestamptz,
  valid_until timestamptz,
  single_use boolean not null default false,
  requires_approval boolean not null default false,
  stackable boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (tenant_id, id)
);

create table if not exists app.discount_approvals (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  customer_id uuid not null,
  operation_type text not null check (operation_type in ('appointment','package','sale')),
  operation_id uuid,
  requested_by uuid not null,
  requested_percentage numeric,
  requested_amount_cents bigint,
  justification text not null,
  status text not null check (status in ('pending','approved','rejected')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null,
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references app.customers(tenant_id, id) on delete restrict
);

alter table app.tenant_users enable row level security;
alter table app.relationship_profile_configs enable row level security;
alter table app.discount_policies enable row level security;
alter table app.discount_approvals enable row level security;

alter table app.tenant_users force row level security;
alter table app.relationship_profile_configs force row level security;
alter table app.discount_policies force row level security;
alter table app.discount_approvals force row level security;

drop policy if exists tenant_users_tenant_isolation on app.tenant_users;
create policy tenant_users_tenant_isolation on app.tenant_users using (tenant_id = app.current_tenant_id()) with check (tenant_id = app.current_tenant_id());
drop policy if exists relationship_profile_configs_tenant_isolation on app.relationship_profile_configs;
create policy relationship_profile_configs_tenant_isolation on app.relationship_profile_configs using (tenant_id = app.current_tenant_id()) with check (tenant_id = app.current_tenant_id());
drop policy if exists discount_policies_tenant_isolation on app.discount_policies;
create policy discount_policies_tenant_isolation on app.discount_policies using (tenant_id = app.current_tenant_id()) with check (tenant_id = app.current_tenant_id());
drop policy if exists discount_approvals_tenant_isolation on app.discount_approvals;
create policy discount_approvals_tenant_isolation on app.discount_approvals using (tenant_id = app.current_tenant_id()) with check (tenant_id = app.current_tenant_id());

commit;

begin;

create table if not exists app.assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  service_id uuid not null,
  professional_id uuid not null,
  result text not null check (result in ('fit','fit_with_restrictions','not_fit')),
  restrictions text[] not null default '{}',
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  constraint assessments_customer_fk foreign key (tenant_id, customer_id) references app.customers (tenant_id, id),
  constraint assessments_service_fk foreign key (tenant_id, service_id) references app.services (tenant_id, id),
  constraint assessments_professional_fk foreign key (tenant_id, professional_id) references app.professionals (tenant_id, id),
  constraint assessments_restrictions_ck check (result <> 'fit_with_restrictions' or cardinality(restrictions) > 0),
  unique (tenant_id, id)
);
create index if not exists assessments_customer_idx on app.assessments (tenant_id, customer_id, created_at desc);

create table if not exists app.technical_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null,
  region text,
  equipment_id uuid,
  power numeric,
  power_unit text,
  reaction text,
  notes text,
  created_at timestamptz not null default now(),
  constraint technical_records_session_fk foreign key (tenant_id, session_id) references app.sessions (tenant_id, id),
  constraint technical_records_equipment_fk foreign key (tenant_id, equipment_id) references app.equipment (tenant_id, id),
  constraint technical_records_power_ck check (power is null or power >= 0),
  constraint technical_records_power_unit_ck check (power is null or nullif(trim(power_unit), '') is not null),
  unique (tenant_id, id)
);
create index if not exists technical_records_session_idx on app.technical_records (tenant_id, session_id, created_at);

create table if not exists app.follow_ups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  session_id uuid,
  suggested_at timestamptz not null,
  reason text,
  appointment_id uuid,
  status text not null default 'pending' check (status in ('pending','scheduled','completed','canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_ups_customer_fk foreign key (tenant_id, customer_id) references app.customers (tenant_id, id),
  constraint follow_ups_session_fk foreign key (tenant_id, session_id) references app.sessions (tenant_id, id),
  constraint follow_ups_appointment_fk foreign key (tenant_id, appointment_id) references app.appointments (tenant_id, id),
  constraint follow_ups_scheduled_appointment_ck check (status <> 'scheduled' or appointment_id is not null),
  unique (tenant_id, id)
);
create index if not exists follow_ups_tenant_status_idx on app.follow_ups (tenant_id, status, suggested_at);

alter table app.assessments enable row level security;
alter table app.technical_records enable row level security;
alter table app.follow_ups enable row level security;

create policy assessments_tenant_isolation on app.assessments
  using (tenant_id = app.current_tenant_id()) with check (tenant_id = app.current_tenant_id());
create policy technical_records_tenant_isolation on app.technical_records
  using (tenant_id = app.current_tenant_id()) with check (tenant_id = app.current_tenant_id());
create policy follow_ups_tenant_isolation on app.follow_ups
  using (tenant_id = app.current_tenant_id()) with check (tenant_id = app.current_tenant_id());

commit;

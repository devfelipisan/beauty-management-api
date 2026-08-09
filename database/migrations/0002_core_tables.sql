begin;

create table if not exists app.tenants (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  document text not null,
  timezone text not null default 'America/Sao_Paulo',
  status text not null check (status in ('trial','active','suspended','closed')),
  created_at timestamptz not null default now(),
  unique (document)
);

create table if not exists app.tenant_brandings (
  tenant_id uuid primary key references app.tenants(id) on delete restrict,
  primary_color text,
  secondary_color text,
  logo_file_id uuid,
  favicon_file_id uuid,
  hero_file_id uuid,
  updated_at timestamptz not null default now(),
  check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  check (secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists app.professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  display_name text not null,
  specialty text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table if not exists app.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  name text not null,
  category text not null,
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
  price_cents bigint not null check (price_cents >= 0),
  active boolean not null default true,
  deposit_required boolean not null default false,
  deposit_type text not null default 'none' check (deposit_type in ('none','fixed','percentage')),
  deposit_value numeric(14,2) not null default 0 check (deposit_value >= 0),
  assessment_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (deposit_type <> 'percentage' or deposit_value <= 100),
  check ((deposit_required and deposit_type <> 'none') or (not deposit_required and deposit_type = 'none'))
);

create table if not exists app.professional_services (
  tenant_id uuid not null,
  professional_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, professional_id, service_id),
  foreign key (tenant_id, professional_id) references app.professionals(tenant_id, id) on delete cascade,
  foreign key (tenant_id, service_id) references app.services(tenant_id, id) on delete cascade
);

create table if not exists app.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  full_name text not null,
  phone text not null,
  email text,
  status text not null default 'active' check (status in ('active','inactive','blocked')),
  relationship_profile text not null default 'new' check (relationship_profile in ('new','returning','loyal','inactive','frequent_no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create unique index if not exists customers_tenant_phone_uq
  on app.customers (tenant_id, phone)
  where status <> 'inactive';

create unique index if not exists customers_tenant_email_uq
  on app.customers (tenant_id, lower(email))
  where email is not null and status <> 'inactive';

create table if not exists app.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  customer_id uuid not null,
  professional_id uuid not null,
  service_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('awaiting_deposit','awaiting_confirmation','confirmed','checked_in','in_progress','completed','rescheduled','canceled','no_show','expired')),
  base_price_cents bigint not null check (base_price_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  final_price_cents bigint not null check (final_price_cents >= 0),
  deposit_cents bigint not null default 0 check (deposit_cents >= 0),
  origin text not null check (origin in ('reception','landing_page','whatsapp','return','campaign','referral','manual')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references app.customers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, professional_id) references app.professionals(tenant_id, id) on delete restrict,
  foreign key (tenant_id, service_id) references app.services(tenant_id, id) on delete restrict,
  check (ends_at > starts_at),
  check (discount_cents <= base_price_cents),
  check (final_price_cents = base_price_cents - discount_cents),
  check (deposit_cents <= final_price_cents)
);

create index if not exists appointments_tenant_starts_idx on app.appointments (tenant_id, starts_at);
create index if not exists appointments_tenant_professional_starts_idx on app.appointments (tenant_id, professional_id, starts_at);
create index if not exists appointments_tenant_customer_idx on app.appointments (tenant_id, customer_id);

create table if not exists app.deposits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  appointment_id uuid not null,
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null check (status in ('not_required','awaiting_payment','proof_submitted','under_review','confirmed','rejected','expired','refunded','retained','credit')),
  payment_method text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, appointment_id),
  foreign key (tenant_id, appointment_id) references app.appointments(tenant_id, id) on delete restrict
);

create table if not exists app.sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  appointment_id uuid not null,
  customer_id uuid not null,
  professional_id uuid not null,
  service_id uuid not null,
  status text not null check (status in ('in_progress','completed')),
  started_at timestamptz not null,
  completed_at timestamptz,
  technical_form_version integer not null default 1 check (technical_form_version > 0),
  unique (tenant_id, id),
  unique (tenant_id, appointment_id),
  foreign key (tenant_id, appointment_id) references app.appointments(tenant_id, id) on delete restrict,
  foreign key (tenant_id, customer_id) references app.customers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, professional_id) references app.professionals(tenant_id, id) on delete restrict,
  foreign key (tenant_id, service_id) references app.services(tenant_id, id) on delete restrict,
  check (completed_at is null or completed_at >= started_at)
);

create table if not exists app.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  customer_id uuid not null,
  origin_type text not null check (origin_type in ('appointment','session','package','credit','other')),
  origin_id uuid not null,
  amount_cents bigint not null check (amount_cents >= 0),
  method text not null check (method in ('cash','pix','debit_card','credit_card','transfer','internal_credit')),
  status text not null check (status in ('pending','partial','paid','refunded','canceled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references app.customers(tenant_id, id) on delete restrict
);

create index if not exists payments_tenant_customer_idx on app.payments (tenant_id, customer_id, created_at desc);

commit;

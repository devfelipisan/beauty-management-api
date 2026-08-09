create table if not exists app.leads (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  service_id uuid,
  professional_id uuid,
  desired_period text,
  notes text,
  origin text not null check (origin in ('landing_contact','landing_newsletter','landing_service_interest','whatsapp','campaign','referral','manual')),
  privacy_consent_at timestamptz,
  marketing_consent_at timestamptz,
  status text not null check (status in ('new','in_contact','awaiting_customer','appointment_created','converted','no_response','lost','duplicate')),
  customer_id uuid,
  appointment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_contact_required check (nullif(btrim(phone),'') is not null or nullif(btrim(email),'') is not null),
  unique (tenant_id, id),
  foreign key (tenant_id, service_id) references app.services(tenant_id, id),
  foreign key (tenant_id, professional_id) references app.professionals(tenant_id, id),
  foreign key (tenant_id, customer_id) references app.customers(tenant_id, id),
  foreign key (tenant_id, appointment_id) references app.appointments(tenant_id, id)
);

create index if not exists leads_tenant_created_at_idx on app.leads (tenant_id, created_at desc);
create index if not exists leads_tenant_status_idx on app.leads (tenant_id, status);
create index if not exists leads_tenant_phone_idx on app.leads (tenant_id, phone) where phone is not null;
create index if not exists leads_tenant_email_idx on app.leads (tenant_id, lower(email)) where email is not null;

alter table app.leads enable row level security;
alter table app.leads force row level security;

drop policy if exists leads_tenant_isolation on app.leads;
create policy leads_tenant_isolation on app.leads
  using (tenant_id::text = current_setting('app.tenant_id', true))
  with check (tenant_id::text = current_setting('app.tenant_id', true));

begin;

create table if not exists app.tenant_settings (
  tenant_id uuid primary key references app.tenants(id) on delete cascade,
  display_name text not null,
  legal_name text,
  document text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  postal_code text,
  primary_unit_name text,
  timezone text not null,
  locale text not null default 'pt-BR',
  currency text not null default 'BRL',
  week_starts_on text not null default 'monday' check (week_starts_on in ('monday','sunday')),
  theme_mode text not null default 'system' check (theme_mode in ('light','dark','system')),
  interface_density text not null default 'comfortable' check (interface_density in ('comfortable','compact')),
  radius text not null default 'soft' check (radius in ('subtle','soft','rounded')),
  short_name text,
  show_brand_name boolean not null default true,
  show_breadcrumbs boolean not null default true,
  show_dashboard_shortcuts boolean not null default true,
  compact_navigation boolean not null default false,
  default_agenda_view text not null default 'week' check (default_agenda_view in ('day','week','month')),
  session_timeout_minutes integer not null default 60 check (session_timeout_minutes between 5 and 1440),
  logout_on_inactivity boolean not null default true,
  privacy_contact text,
  plan_name text,
  license_status text,
  updated_at timestamptz not null default now()
);

create table if not exists app.landing_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references app.tenants(id) on delete cascade,
  slug text not null,
  status text not null default 'draft' check (status in ('not_configured','draft','ready','published','hidden')),
  template text not null check (template in ('editorial_clean','institutional_light','minimal')),
  brand_name text not null,
  hero_title text not null,
  hero_subtitle text,
  hero_description text,
  cta_label text not null,
  about text,
  whatsapp text,
  phone text,
  email text,
  address text,
  business_hours text,
  instagram text,
  facebook text,
  public_service_ids uuid[] not null default '{}',
  public_professional_ids uuid[] not null default '{}',
  gallery_file_ids uuid[] not null default '{}',
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

alter table app.tenant_settings enable row level security;
alter table app.tenant_settings force row level security;
alter table app.landing_pages enable row level security;
alter table app.landing_pages force row level security;

drop policy if exists tenant_settings_tenant_policy on app.tenant_settings;
create policy tenant_settings_tenant_policy on app.tenant_settings
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists landing_pages_tenant_policy on app.landing_pages;
create policy landing_pages_tenant_policy on app.landing_pages
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

insert into identity.permissions (code, description) values
  ('tenant-settings:update', 'Update tenant interface and operational settings'),
  ('landing-page:read', 'Read tenant landing page configuration'),
  ('landing-page:manage', 'Create, publish and hide tenant landing page')
on conflict (code) do update set description = excluded.description;

insert into identity.role_permissions (role_id, permission_code)
select r.id, p.code
from identity.roles r
join identity.permissions p on p.code in ('tenant-settings:update','landing-page:read','landing-page:manage')
where r.tenant_id is null and r.code in ('platform_admin','tenant_admin')
on conflict do nothing;

commit;

begin;

-- High-volume deterministic demo dataset.
--
-- Goals:
--   * exercise multi-tenant isolation and all major MVP lifecycles;
--   * keep the dataset reproducible across local/dev/test environments;
--   * preserve relational consistency instead of producing unrelated random rows;
--   * provide enough volume for pagination, dashboards, filters and query validation.
--
-- This seed intentionally extends 0001_demo_use_cases.sql. It is safe to re-run:
-- deterministic UUIDs plus ON CONFLICT make the inserts idempotent.

set local timezone = 'UTC';

-- ---------------------------------------------------------------------------
-- Tenants, settings, landing pages and branding
-- ---------------------------------------------------------------------------

insert into app.tenants (id, legal_name, display_name, document, timezone, status, public_slug, created_at) values
  ('10000000-0000-0000-0000-000000000003', 'Essenza Spa LTDA', 'Essenza Spa', '33445566000177', 'America/Sao_Paulo', 'trial', 'essenza-spa', '2026-01-15T12:00:00Z'),
  ('10000000-0000-0000-0000-000000000004', 'Studio Aurora Estetica LTDA', 'Studio Aurora', '55667788000199', 'America/Sao_Paulo', 'suspended', 'studio-aurora', '2025-11-10T12:00:00Z')
on conflict (id) do update set
  display_name = excluded.display_name,
  timezone = excluded.timezone,
  status = excluded.status,
  public_slug = excluded.public_slug;

insert into app.tenant_brandings (tenant_id, primary_color, secondary_color, updated_at)
select t.id,
       case t.id::text
         when '10000000-0000-0000-0000-000000000001' then '#A44F67'
         when '10000000-0000-0000-0000-000000000002' then '#202124'
         when '10000000-0000-0000-0000-000000000003' then '#6F7C72'
         else '#8A6652'
       end,
       case t.id::text
         when '10000000-0000-0000-0000-000000000001' then '#C88698'
         when '10000000-0000-0000-0000-000000000002' then '#6F42C1'
         when '10000000-0000-0000-0000-000000000003' then '#C7B9A7'
         else '#D7B89D'
       end,
       '2026-08-10T12:00:00Z'::timestamptz
from app.tenants t
where t.id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004'
)
on conflict (tenant_id) do update set
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  updated_at = excluded.updated_at;

insert into app.tenant_settings (
  tenant_id, display_name, legal_name, document, phone, email, address, city, state,
  postal_code, primary_unit_name, timezone, locale, currency, week_starts_on,
  theme_mode, interface_density, radius, short_name, show_brand_name,
  show_breadcrumbs, show_dashboard_shortcuts, compact_navigation,
  default_agenda_view, session_timeout_minutes, logout_on_inactivity,
  privacy_contact, plan_name, license_status, updated_at
)
select t.id, t.display_name, t.legal_name, t.document,
       '+55222777000' || right(t.id::text, 1),
       lower(replace(t.public_slug, '-', '.')) || '@example.test',
       'Avenida Demo, ' || (100 + right(t.id::text, 1)::int),
       'Macaé', 'RJ', '27900-000', 'Unidade Principal', t.timezone,
       'pt-BR', 'BRL', 'monday',
       case when t.id = '10000000-0000-0000-0000-000000000002' then 'dark' else 'system' end,
       'comfortable', 'soft', t.display_name, true, true, true, false,
       'week', 60, true, 'privacidade+' || t.public_slug || '@example.test',
       case t.status when 'trial' then 'Trial' else 'Professional' end,
       case t.status when 'suspended' then 'suspended' when 'trial' then 'trial' else 'active' end,
       '2026-08-10T12:00:00Z'::timestamptz
from app.tenants t
where t.id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004'
)
on conflict (tenant_id) do update set
  display_name = excluded.display_name,
  legal_name = excluded.legal_name,
  document = excluded.document,
  plan_name = excluded.plan_name,
  license_status = excluded.license_status,
  updated_at = excluded.updated_at;

insert into app.landing_pages (
  id, tenant_id, slug, status, template, brand_name, hero_title, hero_subtitle,
  hero_description, cta_label, about, whatsapp, phone, email, address,
  business_hours, instagram, facebook, public_service_ids,
  public_professional_ids, gallery_file_ids, published_at, updated_at
)
select md5('volume:landing:' || t.id::text)::uuid,
       t.id,
       t.public_slug,
       case t.id::text
         when '10000000-0000-0000-0000-000000000001' then 'published'
         when '10000000-0000-0000-0000-000000000002' then 'published'
         when '10000000-0000-0000-0000-000000000003' then 'draft'
         else 'hidden'
       end,
       case right(t.id::text, 1)::int % 3
         when 0 then 'minimal'
         when 1 then 'editorial_clean'
         else 'institutional_light'
       end,
       t.display_name,
       'Cuidado, técnica e experiência em cada atendimento',
       'Atendimentos personalizados por profissionais especializados',
       'Conheça nossos serviços, profissionais e acompanhe uma experiência pensada para cada etapa da sua jornada.',
       'Quero receber informações',
       'Ambiente demonstrativo da plataforma Beauty Management.',
       '+552299999000' || right(t.id::text, 1),
       '+55222777000' || right(t.id::text, 1),
       lower(replace(t.public_slug, '-', '.')) || '@example.test',
       'Macaé - RJ',
       'Segunda a sábado, conforme agenda',
       'https://instagram.com/' || replace(t.public_slug, '-', ''),
       null,
       '{}'::uuid[], '{}'::uuid[], '{}'::uuid[],
       case when t.id in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')
         then '2026-08-01T12:00:00Z'::timestamptz else null end,
       '2026-08-10T12:00:00Z'::timestamptz
from app.tenants t
where t.id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004'
)
on conflict (tenant_id) do update set
  slug = excluded.slug,
  status = excluded.status,
  template = excluded.template,
  brand_name = excluded.brand_name,
  updated_at = excluded.updated_at;

-- ---------------------------------------------------------------------------
-- Identity: 45 users in total (0001 contributes four)
-- ---------------------------------------------------------------------------

with generated as (
  select g,
         md5('volume:user:' || g)::uuid as user_id,
         md5('volume:auth:' || g)::uuid as auth_subject,
         case
           when g <= 15 then '10000000-0000-0000-0000-000000000001'::uuid
           when g <= 26 then '10000000-0000-0000-0000-000000000002'::uuid
           when g <= 35 then '10000000-0000-0000-0000-000000000003'::uuid
           else '10000000-0000-0000-0000-000000000004'::uuid
         end as tenant_id
  from generate_series(1, 41) g
)
insert into identity.users (id, auth_subject, full_name, email, status, created_at)
select user_id, auth_subject,
       'Usuário Demonstração ' || lpad(g::text, 2, '0'),
       'usuario.' || lpad(g::text, 2, '0') || '@example.test',
       case when g in (14, 32, 41) then 'suspended' else 'active' end,
       '2026-01-01T12:00:00Z'::timestamptz + (g || ' hours')::interval
from generated
on conflict (id) do nothing;

with generated as (
  select g,
         md5('volume:user:' || g)::uuid as user_id,
         md5('volume:membership:' || g)::uuid as membership_id,
         case
           when g <= 15 then '10000000-0000-0000-0000-000000000001'::uuid
           when g <= 26 then '10000000-0000-0000-0000-000000000002'::uuid
           when g <= 35 then '10000000-0000-0000-0000-000000000003'::uuid
           else '10000000-0000-0000-0000-000000000004'::uuid
         end as tenant_id
  from generate_series(1, 41) g
)
insert into identity.tenant_memberships (id, tenant_id, user_id, status, created_at, joined_at)
select membership_id, tenant_id, user_id,
       case when g in (14, 32, 41) then 'suspended' else 'active' end,
       '2026-01-01T12:00:00Z'::timestamptz + (g || ' hours')::interval,
       '2026-01-02T12:00:00Z'::timestamptz + (g || ' hours')::interval
from generated
on conflict (tenant_id, user_id) do nothing;

with generated as (
  select g,
         md5('volume:membership:' || g)::uuid as membership_id,
         case
           when g <= 15 then '10000000-0000-0000-0000-000000000001'::uuid
           when g <= 26 then '10000000-0000-0000-0000-000000000002'::uuid
           when g <= 35 then '10000000-0000-0000-0000-000000000003'::uuid
           else '10000000-0000-0000-0000-000000000004'::uuid
         end as tenant_id,
         case
           when g % 11 = 0 then 'tenant_admin'
           when g % 4 = 0 then 'reception'
           else 'professional'
         end as role_code
  from generate_series(1, 41) g
)
insert into identity.membership_roles (tenant_id, membership_id, role_id)
select g.tenant_id, g.membership_id, r.id
from generated g
join identity.roles r on r.tenant_id = g.tenant_id and r.code = g.role_code
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Professionals: 24 total (0001 contributes three)
-- ---------------------------------------------------------------------------

with config as (
  select * from (values
    ('10000000-0000-0000-0000-000000000001'::uuid, 7, 'Bella', 'Estética, laser e cuidados faciais'),
    ('10000000-0000-0000-0000-000000000002'::uuid, 5, 'Ink', 'Tatuagem e projetos autorais'),
    ('10000000-0000-0000-0000-000000000003'::uuid, 5, 'Essenza', 'Massoterapia e estética'),
    ('10000000-0000-0000-0000-000000000004'::uuid, 4, 'Aurora', 'Estética e bem-estar')
  ) as c(tenant_id, amount, prefix, specialty)
), generated as (
  select c.*, g
  from config c
  cross join lateral generate_series(1, c.amount) g
)
insert into app.professionals (id, tenant_id, display_name, specialty, active, created_at)
select md5('volume:professional:' || tenant_id::text || ':' || g)::uuid,
       tenant_id,
       prefix || ' Profissional ' || lpad(g::text, 2, '0'),
       specialty,
       not (tenant_id = '10000000-0000-0000-0000-000000000004'::uuid and g = 4),
       '2025-12-01T12:00:00Z'::timestamptz + (g || ' days')::interval
from generated
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Services: 45 total (0001 contributes three)
-- ---------------------------------------------------------------------------

with config as (
  select * from (values
    ('10000000-0000-0000-0000-000000000001'::uuid, 12, 'Bella'),
    ('10000000-0000-0000-0000-000000000002'::uuid, 10, 'Ink'),
    ('10000000-0000-0000-0000-000000000003'::uuid, 10, 'Essenza'),
    ('10000000-0000-0000-0000-000000000004'::uuid, 10, 'Aurora')
  ) as c(tenant_id, amount, prefix)
), generated as (
  select c.*, g
  from config c
  cross join lateral generate_series(1, c.amount) g
)
insert into app.services (
  id, tenant_id, name, category, duration_minutes, price_cents, active,
  deposit_required, deposit_type, deposit_value, assessment_required, created_at
)
select md5('volume:service:' || tenant_id::text || ':' || g)::uuid,
       tenant_id,
       case
         when prefix = 'Ink' then 'Projeto de tatuagem ' || lpad(g::text, 2, '0')
         when g % 4 = 0 then 'Massagem e cuidado corporal ' || lpad(g::text, 2, '0')
         when g % 3 = 0 then 'Procedimento facial ' || lpad(g::text, 2, '0')
         else 'Procedimento laser ' || lpad(g::text, 2, '0')
       end,
       case
         when prefix = 'Ink' then 'tatuagem'
         when g % 4 = 0 then 'massagem'
         when g % 3 = 0 then 'facial'
         else 'laser'
       end,
       case when prefix = 'Ink' then 90 + (g % 3) * 30 else 30 + (g % 4) * 15 end,
       (9000 + g * 1700 + case when prefix = 'Ink' then 18000 else 0 end)::bigint,
       not (g = amount and prefix = 'Aurora'),
       g % 3 <> 0,
       case when g % 3 <> 0 then 'percentage' else 'none' end,
       case when g % 3 <> 0 then (case when g % 2 = 0 then 20 else 30 end) else 0 end,
       prefix = 'Ink' or g % 4 = 1,
       '2025-12-01T12:00:00Z'::timestamptz + (g || ' days')::interval
from generated
on conflict (id) do nothing;

-- Every active service is executable by at least one active professional;
-- most services intentionally have two professionals to exercise filtering.
insert into app.professional_services (tenant_id, professional_id, service_id)
select s.tenant_id, p.id, s.id
from app.services s
join lateral (
  select p.id
  from app.professionals p
  where p.tenant_id = s.tenant_id and p.active
  order by p.id
  limit 2
) p on true
where s.active
  and s.tenant_id in (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000004'
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Equipment: 18 total (0001 contributes two)
-- ---------------------------------------------------------------------------

with generated as (
  select g,
         case
           when g <= 6 then '10000000-0000-0000-0000-000000000001'::uuid
           when g <= 10 then '10000000-0000-0000-0000-000000000002'::uuid
           when g <= 13 then '10000000-0000-0000-0000-000000000003'::uuid
           else '10000000-0000-0000-0000-000000000004'::uuid
         end tenant_id
  from generate_series(1, 16) g
)
insert into app.equipment (
  id, tenant_id, name, model, manufacturer, serial_number, primary_unit,
  status, notes, usage_count, created_at, updated_at
)
select md5('volume:equipment:' || g)::uuid,
       tenant_id,
       case when g between 7 and 10 then 'Máquina Tattoo ' else 'Equipamento Estético ' end || lpad(g::text, 2, '0'),
       'MODEL-' || lpad(g::text, 3, '0'),
       case when g between 7 and 10 then 'InkTools' else 'DemoMed' end,
       'DEMO-' || lpad(g::text, 6, '0'),
       case when g between 7 and 10 then 'rpm' else 'J/cm²' end,
       case
         when g in (5, 12) then 'maintenance'
         when g in (9, 15) then 'blocked'
         when g in (10, 16) then 'inactive'
         else 'available'
       end,
       'Equipamento determinístico para cenários de desenvolvimento e teste.',
       (g * 23) % 170,
       '2025-12-01T12:00:00Z'::timestamptz,
       '2026-08-10T12:00:00Z'::timestamptz
from generated
on conflict (id) do nothing;

insert into app.equipment_services (tenant_id, equipment_id, service_id)
select e.tenant_id, e.id, s.id
from app.equipment e
join lateral (
  select s.id
  from app.services s
  where s.tenant_id = e.tenant_id and s.active
  order by s.id
  limit 3
) s on true
where e.tenant_id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004'
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Customers: 1,500 total (0001 contributes four)
-- ---------------------------------------------------------------------------

with generated as (
  select g,
         case
           when g <= 600 then '10000000-0000-0000-0000-000000000001'::uuid
           when g <= 1050 then '10000000-0000-0000-0000-000000000002'::uuid
           when g <= 1400 then '10000000-0000-0000-0000-000000000003'::uuid
           else '10000000-0000-0000-0000-000000000004'::uuid
         end tenant_id
  from generate_series(1, 1496) g
)
insert into app.customers (
  id, tenant_id, full_name, phone, email, status, relationship_profile,
  created_at, updated_at
)
select md5('volume:customer:' || g)::uuid,
       tenant_id,
       'Cliente Demonstração ' || lpad(g::text, 4, '0'),
       '+55229' || lpad(g::text, 8, '0'),
       case when g % 7 = 0 then null else 'cliente.' || lpad(g::text, 4, '0') || '@example.test' end,
       case when g % 10 = 8 then 'inactive' when g % 37 = 0 then 'blocked' else 'active' end,
       case g % 10
         when 0 then 'new'
         when 1 then 'new'
         when 2 then 'returning'
         when 3 then 'returning'
         when 4 then 'returning'
         when 5 then 'loyal'
         when 6 then 'loyal'
         when 7 then 'loyal'
         when 8 then 'inactive'
         else 'frequent_no_show'
       end,
       '2025-02-01T12:00:00Z'::timestamptz + ((g % 500) || ' days')::interval,
       '2026-08-10T12:00:00Z'::timestamptz - ((g % 90) || ' days')::interval
from generated
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Appointments: add 8,000 coherent journeys.
-- Active states have globally unique future slots, while historical terminal
-- states intentionally span the previous ~18 months.
-- ---------------------------------------------------------------------------

with professional_service as (
  select ps.tenant_id, ps.professional_id, ps.service_id,
         row_number() over (order by ps.tenant_id, ps.professional_id, ps.service_id) as rn,
         count(*) over () as total
  from app.professional_services ps
  join app.professionals p on p.tenant_id = ps.tenant_id and p.id = ps.professional_id and p.active
  join app.services s on s.tenant_id = ps.tenant_id and s.id = ps.service_id and s.active
  where ps.tenant_id in (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000004'
  )
), customers_by_tenant as (
  select tenant_id, array_agg(id order by id) ids, count(*)::int cnt
  from app.customers
  where tenant_id in (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000004'
  )
  group by tenant_id
), generated as (
  select g,
         ps.tenant_id, ps.professional_id, ps.service_id,
         cb.ids[1 + ((g - 1) % cb.cnt)] as customer_id,
         s.duration_minutes, s.price_cents, s.deposit_required, s.deposit_value,
         case
           when g <= 700 then '2026-08-11T08:00:00Z'::timestamptz + (g * interval '2 hours')
           else '2026-08-10T18:00:00Z'::timestamptz - ((g - 700) * interval '95 minutes')
         end as starts_at,
         case
           when g <= 700 then
             (array['awaiting_deposit','awaiting_confirmation','confirmed','checked_in','in_progress'])[1 + ((g - 1) % 5)]
           else
             case (g % 20)
               when 14 then 'rescheduled'
               when 15 then 'canceled'
               when 16 then 'no_show'
               when 17 then 'expired'
               else 'completed'
             end
         end as status,
         case (g % 7)
           when 0 then 'landing_page'
           when 1 then 'reception'
           when 2 then 'whatsapp'
           when 3 then 'return'
           when 4 then 'campaign'
           when 5 then 'referral'
           else 'manual'
         end as origin,
         case when g % 5 = 0 then 10 when g % 3 = 0 then 5 else 0 end as discount_percent
  from generate_series(1, 8000) g
  join professional_service ps on ps.rn = 1 + ((g - 1) % ps.total)
  join customers_by_tenant cb on cb.tenant_id = ps.tenant_id
  join app.services s on s.tenant_id = ps.tenant_id and s.id = ps.service_id
)
insert into app.appointments (
  id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
  status, base_price_cents, discount_cents, final_price_cents, deposit_cents,
  origin, created_at, updated_at
)
select md5('volume:appointment:' || g)::uuid,
       tenant_id, customer_id, professional_id, service_id,
       starts_at,
       starts_at + (duration_minutes || ' minutes')::interval,
       status,
       price_cents,
       floor(price_cents * discount_percent / 100.0)::bigint,
       price_cents - floor(price_cents * discount_percent / 100.0)::bigint,
       case when deposit_required then
         floor((price_cents - floor(price_cents * discount_percent / 100.0)::bigint) * deposit_value / 100.0)::bigint
       else 0 end,
       origin,
       least(starts_at - interval '7 days', '2026-08-09T12:00:00Z'::timestamptz),
       least(starts_at - interval '1 day', '2026-08-10T12:00:00Z'::timestamptz)
from generated
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Deposits: add 5,000 examples covering payment/review/retention/refund/credit.
-- ---------------------------------------------------------------------------

with candidates as (
  select a.*,
         row_number() over (order by a.created_at, a.id) rn
  from app.appointments a
  where a.id::text = md5('volume:appointment:' || substring(a.id::text, 1, 0))::text
     or a.id in (select md5('volume:appointment:' || g)::uuid from generate_series(1, 8000) g)
), selected as (
  select * from candidates where rn <= 5000
)
insert into app.deposits (
  id, tenant_id, appointment_id, amount_cents, status, payment_method,
  confirmed_at, confirmed_by, created_at
)
select md5('volume:deposit:' || rn)::uuid,
       tenant_id, id, deposit_cents,
       case
         when deposit_cents = 0 then 'not_required'
         when status = 'awaiting_deposit' then
           case rn % 4 when 0 then 'proof_submitted' when 1 then 'under_review' when 2 then 'awaiting_payment' else 'rejected' end
         when status = 'expired' then 'expired'
         when status = 'canceled' then
           case rn % 3 when 0 then 'refunded' when 1 then 'retained' else 'credit' end
         when status = 'no_show' then 'retained'
         when status = 'rescheduled' and rn % 3 = 0 then 'credit'
         else 'confirmed'
       end,
       case when deposit_cents = 0 then null when rn % 3 = 0 then 'pix' when rn % 3 = 1 then 'credit_card' else 'transfer' end,
       case
         when deposit_cents > 0 and status not in ('awaiting_deposit','expired','canceled') then starts_at - interval '2 days'
         else null
       end,
       null,
       created_at + interval '1 hour'
from selected
on conflict (tenant_id, appointment_id) do nothing;

-- ---------------------------------------------------------------------------
-- Sessions: add 4,500 sessions from appointments that legitimately reached
-- in-progress/completed states.
-- ---------------------------------------------------------------------------

with candidates as (
  select a.*, row_number() over (order by a.starts_at, a.id) rn
  from app.appointments a
  where a.id in (select md5('volume:appointment:' || g)::uuid from generate_series(1, 8000) g)
    and a.status in ('completed','in_progress')
    and not exists (
      select 1 from app.sessions s where s.tenant_id = a.tenant_id and s.appointment_id = a.id
    )
), selected as (
  select * from candidates where rn <= 4500
)
insert into app.sessions (
  id, tenant_id, appointment_id, customer_id, professional_id, service_id,
  status, started_at, completed_at, technical_form_version
)
select md5('volume:session:' || rn)::uuid,
       tenant_id, id, customer_id, professional_id, service_id,
       case when status = 'in_progress' then 'in_progress' else 'completed' end,
       starts_at,
       case when status = 'completed' then ends_at else null end,
       1 + (rn % 3)
from selected
on conflict (tenant_id, appointment_id) do nothing;

-- ---------------------------------------------------------------------------
-- Assessments: 950 outcomes including restrictions and not-fit decisions.
-- ---------------------------------------------------------------------------

with candidates as (
  select a.*, row_number() over (order by a.created_at, a.id) rn
  from app.appointments a
  where a.id in (select md5('volume:appointment:' || g)::uuid from generate_series(1, 8000) g)
), selected as (
  select * from candidates where rn <= 950
)
insert into app.assessments (
  id, tenant_id, customer_id, service_id, professional_id, result,
  restrictions, valid_until, created_at
)
select md5('volume:assessment:' || rn)::uuid,
       tenant_id, customer_id, service_id, professional_id,
       case when rn % 20 in (0, 1) then 'not_fit'
            when rn % 10 in (2, 3) then 'fit_with_restrictions'
            else 'fit' end,
       case when rn % 10 in (2, 3) then array['sensibilidade elevada','reavaliar parâmetros antes da sessão']::text[]
            else '{}'::text[] end,
       case when rn % 19 = 0 then starts_at - interval '1 day' else starts_at + interval '180 days' end,
       created_at
from selected
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Technical records: 12,000 historical entries, allowing multiple observations
-- per session and linking equipment from the same tenant where available.
-- ---------------------------------------------------------------------------

with session_pool as (
  select s.*, row_number() over (order by s.tenant_id, s.id) rn, count(*) over () total
  from app.sessions s
  where s.id in (select md5('volume:session:' || g)::uuid from generate_series(1, 4500) g)
), equipment_by_tenant as (
  select tenant_id, array_agg(id order by id) ids, count(*)::int cnt
  from app.equipment
  group by tenant_id
), generated as (
  select g, sp.*, eb.ids, eb.cnt
  from generate_series(1, 12000) g
  join session_pool sp on sp.rn = 1 + ((g - 1) % sp.total)
  left join equipment_by_tenant eb on eb.tenant_id = sp.tenant_id
)
insert into app.technical_records (
  id, tenant_id, session_id, region, equipment_id, power, power_unit,
  reaction, notes, created_at
)
select md5('volume:technical-record:' || g)::uuid,
       tenant_id,
       id,
       (array['face','axilas','pernas','virilha','antebraço','costas'])[1 + ((g - 1) % 6)],
       case when cnt is null then null else ids[1 + ((g - 1) % cnt)] end,
       case when g % 8 = 0 then null else 12 + (g % 11) end,
       case when g % 8 = 0 then null else 'J/cm²' end,
       (array['normal','sensibilidade leve','eritema discreto','sem reação','sensibilidade moderada'])[1 + ((g - 1) % 5)],
       case when g % 37 = 0 then 'Ajuste de parâmetro após reação anterior.' else 'Registro técnico de demonstração.' end,
       coalesce(completed_at, started_at) - interval '2 minutes' + ((g % 3) || ' minutes')::interval
from generated
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Customer packages: 700 packages with active/exhausted/expired/canceled states.
-- ---------------------------------------------------------------------------

with customer_pool as (
  select c.*, row_number() over (order by c.tenant_id, c.id) rn, count(*) over () total
  from app.customers c
), service_by_tenant as (
  select tenant_id, array_agg(id order by id) ids, count(*)::int cnt
  from app.services
  where active
  group by tenant_id
), generated as (
  select g, cp.*, sb.ids as service_ids, sb.cnt as service_count,
         case when g % 5 = 0 then 6 when g % 5 = 1 then 8 when g % 5 = 2 then 10 else 12 end as total_sessions
  from generate_series(1, 700) g
  join customer_pool cp on cp.rn = 1 + ((g - 1) % cp.total)
  join service_by_tenant sb on sb.tenant_id = cp.tenant_id
)
insert into app.customer_packages (
  id, tenant_id, customer_id, service_id, total_sessions, used_sessions,
  valid_until, status, price_cents, created_at, updated_at
)
select md5('volume:package:' || g)::uuid,
       tenant_id, id,
       service_ids[1 + ((g - 1) % service_count)],
       total_sessions,
       case
         when g % 10 = 7 then total_sessions
         when g % 10 in (8, 9) then least(total_sessions, 2 + (g % 4))
         else least(total_sessions - 1, g % greatest(total_sessions, 1))
       end,
       case when g % 10 = 8 then '2026-07-01T12:00:00Z'::timestamptz else '2027-08-10T12:00:00Z'::timestamptz end,
       case
         when g % 10 = 7 then 'exhausted'
         when g % 10 = 8 then 'expired'
         when g % 10 = 9 then 'canceled'
         else 'active'
       end,
       (total_sessions * (7000 + (g % 5) * 1000))::bigint,
       '2025-10-01T12:00:00Z'::timestamptz + ((g % 250) || ' days')::interval,
       '2026-08-10T12:00:00Z'::timestamptz
from generated
on conflict (id) do nothing;

-- Generate one consume movement per used package session. This produces a
-- volume close to the desired ~2.5k movements while keeping package usage
-- internally understandable.
with packages as (
  select p.*
  from app.customer_packages p
  where p.id in (select md5('volume:package:' || g)::uuid from generate_series(1, 700) g)
), expanded as (
  select p.*, n
  from packages p
  cross join lateral generate_series(1, p.used_sessions) n
), session_match as (
  select e.*,
         sm.id as matched_session_id
  from expanded e
  left join lateral (
    select s.id
    from app.sessions s
    where s.tenant_id = e.tenant_id
      and s.customer_id = e.customer_id
      and s.service_id = e.service_id
      and s.status = 'completed'
    order by s.completed_at, s.id
    offset greatest(e.n - 1, 0)
    limit 1
  ) sm on true
)
insert into app.package_movements (
  id, tenant_id, package_id, session_id, quantity, movement_type, reason, created_at
)
select md5('volume:package-movement:' || id::text || ':' || n)::uuid,
       tenant_id, id, matched_session_id, 1, 'consume',
       case when matched_session_id is null then 'Consumo histórico importado para cenário de demonstração.' else 'Consumo vinculado à sessão.' end,
       created_at + (n || ' days')::interval
from session_match
on conflict (id) do nothing;

-- Explicit reverse/adjust examples exercise the non-consume movement branches.
with package_pool as (
  select p.*, row_number() over (order by p.id) rn
  from app.customer_packages p
  where p.id in (select md5('volume:package:' || g)::uuid from generate_series(1, 700) g)
)
insert into app.package_movements (
  id, tenant_id, package_id, session_id, quantity, movement_type, reason, created_at
)
select md5('volume:package-adjustment:' || rn)::uuid,
       tenant_id, id, null, 1,
       case when rn % 2 = 0 then 'reverse' else 'adjust' end,
       case when rn % 2 = 0 then 'Estorno administrativo demonstrativo.' else 'Ajuste auditável de saldo demonstrativo.' end,
       '2026-08-01T12:00:00Z'::timestamptz + (rn || ' minutes')::interval
from package_pool
where rn <= 120
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Payments: add 6,500 rows across all supported methods and states.
-- ---------------------------------------------------------------------------

with candidates as (
  select a.*, row_number() over (order by a.created_at, a.id) rn
  from app.appointments a
  where a.id in (select md5('volume:appointment:' || g)::uuid from generate_series(1, 8000) g)
), selected as (
  select * from candidates where rn <= 6500
)
insert into app.payments (
  id, tenant_id, customer_id, origin_type, origin_id, amount_cents,
  method, status, paid_at, created_at
)
select md5('volume:payment:' || rn)::uuid,
       tenant_id, customer_id,
       case rn % 5 when 0 then 'appointment' when 1 then 'session' when 2 then 'package' when 3 then 'credit' else 'other' end,
       id,
       greatest(final_price_cents - case when rn % 4 = 0 then deposit_cents else 0 end, 0),
       (array['cash','pix','debit_card','credit_card','transfer','internal_credit'])[1 + ((rn - 1) % 6)],
       case
         when rn % 20 = 0 then 'refunded'
         when rn % 17 = 0 then 'canceled'
         when rn % 11 = 0 then 'partial'
         when rn % 7 = 0 then 'pending'
         else 'paid'
       end,
       case when rn % 7 = 0 then null else ends_at + interval '10 minutes' end,
       created_at + interval '2 hours'
from selected
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Follow-ups: 2,000 recommendations after completed sessions.
-- ---------------------------------------------------------------------------

with candidates as (
  select s.*, row_number() over (order by s.completed_at, s.id) rn
  from app.sessions s
  where s.status = 'completed'
    and s.id in (select md5('volume:session:' || g)::uuid from generate_series(1, 4500) g)
), selected as (
  select * from candidates where rn <= 2000
), resolved as (
  select s.*,
         future.id as future_appointment_id
  from selected s
  left join lateral (
    select a.id
    from app.appointments a
    where a.tenant_id = s.tenant_id
      and a.customer_id = s.customer_id
      and a.starts_at > coalesce(s.completed_at, s.started_at)
      and a.status in ('awaiting_deposit','awaiting_confirmation','confirmed','checked_in')
    order by a.starts_at
    limit 1
  ) future on true
)
insert into app.follow_ups (
  id, tenant_id, customer_id, session_id, suggested_at, reason,
  appointment_id, status, created_at, updated_at
)
select md5('volume:follow-up:' || rn)::uuid,
       tenant_id, customer_id, id,
       coalesce(completed_at, started_at) + ((21 + rn % 70) || ' days')::interval,
       case when rn % 4 = 0 then 'Retorno técnico recomendado.' else 'Acompanhamento periódico recomendado.' end,
       case when rn % 4 = 1 and future_appointment_id is not null then future_appointment_id else null end,
       case
         when rn % 4 = 1 and future_appointment_id is not null then 'scheduled'
         when rn % 4 = 2 then 'completed'
         when rn % 4 = 3 then 'canceled'
         else 'pending'
       end,
       coalesce(completed_at, started_at),
       '2026-08-10T12:00:00Z'::timestamptz
from resolved
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Leads: 1,200 institutional/marketing/service-interest records. Leads remain
-- independent from appointments unless their lifecycle explicitly reached a
-- conversion state.
-- ---------------------------------------------------------------------------

with tenant_pool as (
  select t.id, row_number() over (order by t.id) rn, count(*) over () total
  from app.tenants t
  where t.id in (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000004'
  )
), customers_by_tenant as (
  select tenant_id, array_agg(id order by id) ids, count(*)::int cnt
  from app.customers group by tenant_id
), services_by_tenant as (
  select tenant_id, array_agg(id order by id) ids, count(*)::int cnt
  from app.services where active group by tenant_id
), professionals_by_tenant as (
  select tenant_id, array_agg(id order by id) ids, count(*)::int cnt
  from app.professionals where active group by tenant_id
), appointments_by_tenant as (
  select tenant_id, array_agg(id order by id) ids, count(*)::int cnt
  from app.appointments group by tenant_id
), generated as (
  select g, tp.id tenant_id,
         cb.ids customer_ids, cb.cnt customer_count,
         sb.ids service_ids, sb.cnt service_count,
         pb.ids professional_ids, pb.cnt professional_count,
         ab.ids appointment_ids, ab.cnt appointment_count
  from generate_series(1, 1200) g
  join tenant_pool tp on tp.rn = 1 + ((g - 1) % tp.total)
  join customers_by_tenant cb on cb.tenant_id = tp.id
  join services_by_tenant sb on sb.tenant_id = tp.id
  join professionals_by_tenant pb on pb.tenant_id = tp.id
  join appointments_by_tenant ab on ab.tenant_id = tp.id
)
insert into app.leads (
  id, tenant_id, full_name, phone, email, service_id, professional_id,
  desired_period, notes, origin, privacy_consent_at, marketing_consent_at,
  status, customer_id, appointment_id, created_at, updated_at
)
select md5('volume:lead:' || g)::uuid,
       tenant_id,
       'Lead Demonstração ' || lpad(g::text, 4, '0'),
       case when g % 5 = 0 then null else '+55228' || lpad(g::text, 8, '0') end,
       case when g % 5 = 0 then 'lead.' || lpad(g::text, 4, '0') || '@example.test'
            when g % 3 = 0 then 'lead.' || lpad(g::text, 4, '0') || '@example.test' else null end,
       case when g % 4 = 0 then service_ids[1 + ((g - 1) % service_count)] else null end,
       case when g % 9 = 0 then professional_ids[1 + ((g - 1) % professional_count)] else null end,
       (array['manha','tarde','noite','sabado'])[1 + ((g - 1) % 4)],
       case when g % 7 = 0 then 'Deseja receber novidades institucionais.' else 'Interesse registrado sem compromisso de agendamento.' end,
       (array['landing_contact','landing_newsletter','landing_service_interest','whatsapp','campaign','referral','manual'])[1 + ((g - 1) % 7)],
       '2026-01-01T12:00:00Z'::timestamptz + (g || ' hours')::interval,
       case when g % 3 = 0 then '2026-01-01T12:00:00Z'::timestamptz + (g || ' hours')::interval else null end,
       case g % 8
         when 0 then 'new'
         when 1 then 'in_contact'
         when 2 then 'awaiting_customer'
         when 3 then 'appointment_created'
         when 4 then 'converted'
         when 5 then 'no_response'
         when 6 then 'lost'
         else 'duplicate'
       end,
       case when g % 8 in (3,4) then customer_ids[1 + ((g - 1) % customer_count)] else null end,
       case when g % 8 = 3 then appointment_ids[1 + ((g - 1) % appointment_count)] else null end,
       '2026-01-01T12:00:00Z'::timestamptz + (g || ' hours')::interval,
       '2026-08-10T12:00:00Z'::timestamptz
from generated
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Audit trail: 30,000 append-only events spanning major resource types.
-- ---------------------------------------------------------------------------

with appointments as (
  select array_agg(id order by id) ids, count(*)::int cnt from app.appointments
), sessions as (
  select array_agg(id order by id) ids, count(*)::int cnt from app.sessions
), payments as (
  select array_agg(id order by id) ids, count(*)::int cnt from app.payments
), leads as (
  select array_agg(id order by id) ids, count(*)::int cnt from app.leads
), packages as (
  select array_agg(id order by id) ids, count(*)::int cnt from app.customer_packages
), tenants as (
  select array_agg(id order by id) ids, count(*)::int cnt from app.tenants
), generated as (
  select g, a.ids appointment_ids, a.cnt appointment_count,
         s.ids session_ids, s.cnt session_count,
         p.ids payment_ids, p.cnt payment_count,
         l.ids lead_ids, l.cnt lead_count,
         pk.ids package_ids, pk.cnt package_count,
         t.ids tenant_ids, t.cnt tenant_count
  from generate_series(1, 30000) g
  cross join appointments a cross join sessions s cross join payments p
  cross join leads l cross join packages pk cross join tenants t
)
insert into audit.events (
  id, tenant_id, actor_id, actor_type, action, resource_type, resource_id,
  request_id, correlation_id, changes, metadata, occurred_at
)
select md5('volume:audit:' || g)::uuid,
       tenant_ids[1 + ((g - 1) % tenant_count)],
       null,
       case when g % 9 = 0 then 'worker' when g % 17 = 0 then 'system' else 'user' end,
       case g % 10
         when 0 then 'appointment.created'
         when 1 then 'appointment.confirmed'
         when 2 then 'deposit.confirmed'
         when 3 then 'session.started'
         when 4 then 'session.completed'
         when 5 then 'payment.registered'
         when 6 then 'package.consumed'
         when 7 then 'lead.created'
         when 8 then 'follow-up.created'
         else 'customer.profile.changed'
       end,
       case g % 5 when 0 then 'appointment' when 1 then 'session' when 2 then 'payment' when 3 then 'lead' else 'customer_package' end,
       case g % 5
         when 0 then appointment_ids[1 + ((g - 1) % appointment_count)]
         when 1 then session_ids[1 + ((g - 1) % session_count)]
         when 2 then payment_ids[1 + ((g - 1) % payment_count)]
         when 3 then lead_ids[1 + ((g - 1) % lead_count)]
         else package_ids[1 + ((g - 1) % package_count)]
       end,
       'seed-request-' || g,
       'seed-correlation-' || (1 + (g % 4000)),
       jsonb_build_object('seed', true, 'sequence', g),
       jsonb_build_object('dataset', 'demo-dataset-v1'),
       '2025-01-01T00:00:00Z'::timestamptz + (g * interval '20 minutes')
from generated
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Transactional outbox: 12,000 events in published/pending/failed/processing.
-- This also represents notification intents because there is currently no
-- dedicated notification persistence table in the schema.
-- ---------------------------------------------------------------------------

with appointments as (
  select a.id, a.tenant_id, row_number() over (order by a.id) rn, count(*) over () total
  from app.appointments a
), generated as (
  select g, a.id aggregate_id, a.tenant_id
  from generate_series(1, 12000) g
  join appointments a on a.rn = 1 + ((g - 1) % a.total)
)
insert into app.outbox_events (
  id, tenant_id, event_type, aggregate_type, aggregate_id, correlation_id,
  payload, status, attempts, created_at, published_at, last_error
)
select md5('volume:outbox:' || g)::uuid,
       tenant_id,
       (array[
         'appointment.created','deposit.pending','deposit.confirmed',
         'presence.pending','customer.arrived','session.completed',
         'follow-up.due','lead.received','package.low-balance','license.expiring'
       ])[1 + ((g - 1) % 10)],
       'appointment', aggregate_id,
       'seed-outbox-correlation-' || (1 + (g % 2500)),
       jsonb_build_object('seed', true, 'appointmentId', aggregate_id),
       case
         when g % 40 = 0 then 'failed'
         when g % 31 = 0 then 'processing'
         when g % 7 = 0 then 'pending'
         else 'published'
       end,
       case when g % 40 = 0 then 3 when g % 31 = 0 then 1 else 0 end,
       '2025-10-01T00:00:00Z'::timestamptz + (g * interval '15 minutes'),
       case when g % 40 <> 0 and g % 31 <> 0 and g % 7 <> 0
         then '2025-10-01T00:05:00Z'::timestamptz + (g * interval '15 minutes') else null end,
       case when g % 40 = 0 then 'Falha simulada para validar retry idempotente.' else null end
from generated
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Idempotency: 8,000 records across critical operations.
-- ---------------------------------------------------------------------------

with appointments as (
  select a.id, a.tenant_id, row_number() over (order by a.id) rn, count(*) over () total
  from app.appointments a
), generated as (
  select g, a.id resource_id, a.tenant_id
  from generate_series(1, 8000) g
  join appointments a on a.rn = 1 + ((g - 1) % a.total)
)
insert into app.idempotency_keys (
  id, tenant_id, idempotency_key, operation, request_hash, status,
  response, expires_at, created_at, updated_at
)
select md5('volume:idempotency:' || g)::uuid,
       tenant_id,
       'seed-key-' || lpad(g::text, 6, '0'),
       (array[
         'appointment.create','deposit.confirm','session.start','session.complete',
         'payment.register','payment.refund','package.consume'
       ])[1 + ((g - 1) % 7)],
       md5('request-payload:' || g),
       case when g % 29 = 0 then 'failed' when g % 23 = 0 then 'processing' else 'completed' end,
       case when g % 29 = 0 or g % 23 = 0 then null
            else jsonb_build_object('resourceId', resource_id, 'seed', true) end,
       '2027-08-10T12:00:00Z'::timestamptz + ((g % 30) || ' days')::interval,
       '2026-01-01T00:00:00Z'::timestamptz + (g * interval '5 minutes'),
       '2026-01-01T00:01:00Z'::timestamptz + (g * interval '5 minutes')
from generated
on conflict (tenant_id, operation, idempotency_key) do nothing;

-- Refresh public landing arrays after the larger service/professional catalog
-- has been generated.
update app.landing_pages lp
set public_service_ids = coalesce((
      select array_agg(s.id order by s.name)
      from app.services s
      where s.tenant_id = lp.tenant_id and s.active
      limit 12
    ), '{}'::uuid[]),
    public_professional_ids = coalesce((
      select array_agg(p.id order by p.display_name)
      from app.professionals p
      where p.tenant_id = lp.tenant_id and p.active
      limit 8
    ), '{}'::uuid[]),
    updated_at = '2026-08-10T12:00:00Z'::timestamptz
where lp.tenant_id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004'
);

commit;

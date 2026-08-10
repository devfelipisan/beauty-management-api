begin;

-- Deterministic demo data used only for local/dev/test validation.
-- The scenarios intentionally cover the major lifecycle states exposed by the MVP.

-- Tenants / public identity ---------------------------------------------------
insert into app.tenants (id, legal_name, display_name, document, timezone, status, public_slug, created_at) values
  ('10000000-0000-0000-0000-000000000001', 'Bella Estetica LTDA', 'Clínica Bella', '12345678000199', 'America/Sao_Paulo', 'active', 'clinica-bella', '2026-08-01T12:00:00Z'),
  ('10000000-0000-0000-0000-000000000002', 'Ink Studio LTDA', 'Ink Studio', '98765432000199', 'America/Sao_Paulo', 'active', 'ink-studio', '2026-08-01T12:00:00Z')
on conflict (id) do nothing;

insert into app.tenant_brandings (tenant_id, primary_color, secondary_color, updated_at) values
  ('10000000-0000-0000-0000-000000000001', '#A44F67', '#C88698', '2026-08-01T12:00:00Z'),
  ('10000000-0000-0000-0000-000000000002', '#202124', '#6F42C1', '2026-08-01T12:00:00Z')
on conflict (tenant_id) do update set primary_color = excluded.primary_color, secondary_color = excluded.secondary_color, updated_at = excluded.updated_at;

-- Auth identities / memberships / RBAC --------------------------------------
insert into identity.users (id, auth_subject, full_name, email, status, created_at) values
  ('20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'Admin Bella', 'admin.bella@example.test', 'active', '2026-08-01T12:00:00Z'),
  ('20000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'Recepção Bella', 'recepcao.bella@example.test', 'active', '2026-08-01T12:00:00Z'),
  ('20000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000003', 'Ana Martins', 'ana@example.test', 'active', '2026-08-01T12:00:00Z'),
  ('20000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000004', 'Admin Multiempresa', 'multi@example.test', 'active', '2026-08-01T12:00:00Z')
on conflict (id) do nothing;

insert into identity.tenant_memberships (id, tenant_id, user_id, status, created_at, joined_at) values
  ('22000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z'),
  ('22000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'active', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z'),
  ('22000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'active', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z'),
  ('22000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'active', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z'),
  ('22000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', 'active', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z')
on conflict (id) do nothing;

-- Bind demo memberships to default roles created by migrations.
insert into identity.membership_roles (tenant_id, membership_id, role_id)
select m.tenant_id, m.id, r.id
from identity.tenant_memberships m
join identity.roles r on r.tenant_id = m.tenant_id
where (m.id in ('22000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000004','22000000-0000-0000-0000-000000000005') and r.code = 'tenant_admin')
   or (m.id = '22000000-0000-0000-0000-000000000002' and r.code = 'reception')
   or (m.id = '22000000-0000-0000-0000-000000000003' and r.code = 'professional')
on conflict do nothing;

-- Professionals / services ----------------------------------------------------
insert into app.professionals (id, tenant_id, display_name, specialty, active, created_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Ana Martins', 'Estética e laser', true, '2026-08-01T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Bruno Costa', 'Estética facial', true, '2026-08-01T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Rafael Ink', 'Tatuagem', true, '2026-08-01T12:00:00Z')
on conflict (id) do nothing;

insert into app.services (id, tenant_id, name, category, duration_minutes, price_cents, active, deposit_required, deposit_type, deposit_value, assessment_required, created_at) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Depilação a laser - Face', 'laser', 30, 12000, true, true, 'percentage', 20, false, '2026-08-01T12:00:00Z'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Limpeza de pele premium', 'facial', 60, 18000, true, false, 'none', 0, false, '2026-08-01T12:00:00Z'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Tatuagem autoral', 'tatuagem', 120, 45000, true, true, 'percentage', 30, true, '2026-08-01T12:00:00Z')
on conflict (id) do nothing;

insert into app.professional_services (tenant_id, professional_id, service_id) values
  ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000003')
on conflict do nothing;

-- Customers exercise relationship/status views -------------------------------
insert into app.customers (id, tenant_id, full_name, phone, email, status, relationship_profile, created_at, updated_at) values
  ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Mariana Oliveira','22999990001','mariana@example.test','active','new','2026-08-01T12:00:00Z','2026-08-01T12:00:00Z'),
  ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Carla Souza','22999990002','carla@example.test','active','loyal','2026-06-01T12:00:00Z','2026-08-01T12:00:00Z'),
  ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Paula Nunes','22999990003','paula@example.test','active','frequent_no_show','2026-05-01T12:00:00Z','2026-08-01T12:00:00Z'),
  ('50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','Cliente Ink','22999990099','ink.client@example.test','active','returning','2026-07-01T12:00:00Z','2026-08-01T12:00:00Z')
on conflict (id) do nothing;

-- Equipment ------------------------------------------------------------------
insert into app.equipment (id, tenant_id, name, model, manufacturer, serial_number, primary_unit, status, notes, usage_count, created_at, updated_at) values
  ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Laser Diodo Prime','LD-900','DemoMed','BELLA-LD-001','J/cm²','available','Equipamento principal para laser.',28,'2026-08-01T12:00:00Z','2026-08-09T12:00:00Z'),
  ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Laser Backup','LD-500','DemoMed','BELLA-LD-002','J/cm²','maintenance','Exemplo de equipamento em manutenção.',11,'2026-08-01T12:00:00Z','2026-08-09T12:00:00Z')
on conflict (id) do nothing;
insert into app.equipment_services (tenant_id, equipment_id, service_id) values
  ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- Appointments represent major state-machine branches ------------------------
insert into app.appointments (id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at, status, base_price_cents, discount_cents, final_price_cents, deposit_cents, origin, created_at, updated_at) values
  ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','2026-08-10T12:00:00Z','2026-08-10T12:30:00Z','awaiting_deposit',12000,0,12000,2400,'landing_page','2026-08-09T12:00:00Z','2026-08-09T12:00:00Z'),
  ('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','2026-08-10T13:00:00Z','2026-08-10T13:30:00Z','confirmed',12000,1200,10800,2160,'reception','2026-08-08T12:00:00Z','2026-08-09T12:00:00Z'),
  ('70000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','2026-08-09T14:00:00Z','2026-08-09T15:00:00Z','in_progress',18000,0,18000,0,'reception','2026-08-07T12:00:00Z','2026-08-09T14:05:00Z'),
  ('70000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','2026-08-08T16:00:00Z','2026-08-08T16:30:00Z','completed',12000,0,12000,2400,'return','2026-08-06T12:00:00Z','2026-08-08T16:35:00Z'),
  ('70000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','2026-08-07T17:00:00Z','2026-08-07T17:30:00Z','no_show',12000,0,12000,2400,'whatsapp','2026-08-05T12:00:00Z','2026-08-07T17:45:00Z'),
  ('70000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000003','2026-08-12T14:00:00Z','2026-08-12T16:00:00Z','confirmed',45000,0,45000,13500,'landing_page','2026-08-09T12:00:00Z','2026-08-09T12:00:00Z')
on conflict (id) do nothing;

insert into app.deposits (id, tenant_id, appointment_id, amount_cents, status, payment_method, confirmed_at, created_at) values
  ('71000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',2400,'awaiting_payment',null,null,'2026-08-09T12:00:00Z'),
  ('71000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002',2160,'confirmed','pix','2026-08-09T10:00:00Z','2026-08-08T12:00:00Z'),
  ('71000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004',2400,'confirmed','credit_card','2026-08-07T10:00:00Z','2026-08-06T12:00:00Z'),
  ('71000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000005',2400,'retained','pix','2026-08-06T10:00:00Z','2026-08-05T12:00:00Z'),
  ('71000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000006',13500,'confirmed','pix','2026-08-09T11:00:00Z','2026-08-09T10:00:00Z')
on conflict (id) do nothing;

-- Sessions / technical record -------------------------------------------------
insert into app.sessions (id, tenant_id, appointment_id, customer_id, professional_id, service_id, status, started_at, completed_at, technical_form_version) values
  ('72000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','in_progress','2026-08-09T14:05:00Z',null,1),
  ('72000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','completed','2026-08-08T16:02:00Z','2026-08-08T16:28:00Z',1)
on conflict (id) do nothing;

insert into app.technical_records (id, tenant_id, session_id, region, equipment_id, power, power_unit, reaction, notes, created_at) values
  ('73000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002','Face','60000000-0000-0000-0000-000000000001',18,'J/cm²','Eritema leve','Sessão concluída sem intercorrência.','2026-08-08T16:25:00Z')
on conflict (id) do nothing;

-- Assessments include fit and restricted examples ----------------------------
insert into app.assessments (id, tenant_id, customer_id, service_id, professional_id, result, restrictions, valid_until, created_at) values
  ('74000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','fit_with_restrictions',array['Evitar área sensibilizada'],'2026-09-30T23:59:59Z','2026-08-09T09:00:00Z'),
  ('74000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','fit',array[]::text[],'2026-10-31T23:59:59Z','2026-08-09T09:00:00Z')
on conflict (id) do nothing;

-- Packages / consumption history ---------------------------------------------
insert into app.customer_packages (id, tenant_id, customer_id, service_id, total_sessions, used_sessions, valid_until, status, price_cents, created_at, updated_at) values
  ('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001',10,3,'2027-02-01T23:59:59Z','active',90000,'2026-06-01T12:00:00Z','2026-08-08T16:30:00Z'),
  ('80000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',3,3,'2026-08-31T23:59:59Z','exhausted',30000,'2026-05-01T12:00:00Z','2026-08-01T12:00:00Z')
on conflict (id) do nothing;

insert into app.package_movements (id, tenant_id, package_id, session_id, quantity, movement_type, reason, created_at) values
  ('81000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002',1,'consume','Sessão realizada','2026-08-08T16:30:00Z')
on conflict (id) do nothing;

-- Payments -------------------------------------------------------------------
insert into app.payments (id, tenant_id, customer_id, origin_type, origin_id, amount_cents, method, status, paid_at, created_at) values
  ('82000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','session','72000000-0000-0000-0000-000000000002',9600,'pix','paid','2026-08-08T16:35:00Z','2026-08-08T16:35:00Z'),
  ('82000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','appointment','70000000-0000-0000-0000-000000000001',2400,'pix','pending',null,'2026-08-09T12:00:00Z')
on conflict (id) do nothing;

-- Follow-ups cover pending/scheduled/completed --------------------------------
insert into app.follow_ups (id, tenant_id, customer_id, session_id, suggested_at, reason, appointment_id, status, created_at, updated_at) values
  ('83000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000002','2026-09-08T15:00:00Z','Retorno em 30 dias',null,'pending','2026-08-08T16:30:00Z','2026-08-08T16:30:00Z'),
  ('83000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000002','2026-08-10T13:00:00Z','Revisão agendada','70000000-0000-0000-0000-000000000002','scheduled','2026-08-08T16:30:00Z','2026-08-09T12:00:00Z')
on conflict (id) do nothing;

-- Leads exercise acquisition lifecycle ---------------------------------------
insert into app.leads (id, tenant_id, full_name, phone, email, service_id, professional_id, desired_period, notes, origin, privacy_consent_at, marketing_consent_at, status, customer_id, appointment_id, created_at, updated_at) values
  ('84000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Juliana Lead','22999990100','juliana.lead@example.test','40000000-0000-0000-0000-000000000001',null,'manhã','Solicitou informações pela landing page.','landing_service_interest','2026-08-09T12:00:00Z','2026-08-09T12:00:00Z','new',null,null,'2026-08-09T12:00:00Z','2026-08-09T12:00:00Z'),
  ('84000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Lead em contato','22999990101','contato@example.test',null,null,'tarde','Atendimento iniciado pela recepção.','landing_contact','2026-08-08T12:00:00Z',null,'in_contact',null,null,'2026-08-08T12:00:00Z','2026-08-09T10:00:00Z'),
  ('84000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Mariana Oliveira','22999990001','mariana@example.test','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',null,'Lead convertido em cliente/agendamento.','referral','2026-08-01T12:00:00Z',null,'converted','50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','2026-08-01T12:00:00Z','2026-08-09T12:00:00Z')
on conflict (id) do nothing;

-- Tenant settings and public landing content ---------------------------------
insert into app.tenant_settings (tenant_id, display_name, legal_name, document, phone, email, city, state, timezone, locale, currency, week_starts_on, theme_mode, interface_density, radius, show_brand_name, show_breadcrumbs, show_dashboard_shortcuts, compact_navigation, default_agenda_view, session_timeout_minutes, logout_on_inactivity, updated_at) values
  ('10000000-0000-0000-0000-000000000001','Clínica Bella','Bella Estetica LTDA','12345678000199','22999999999','contato@bella.example.test','Macaé','RJ','America/Sao_Paulo','pt-BR','BRL','monday','system','comfortable','soft',true,true,true,false,'week',60,true,'2026-08-09T12:00:00Z'),
  ('10000000-0000-0000-0000-000000000002','Ink Studio','Ink Studio LTDA','98765432000199','22999998888','contato@ink.example.test','Macaé','RJ','America/Sao_Paulo','pt-BR','BRL','monday','dark','compact','subtle',true,true,false,true,'day',90,true,'2026-08-09T12:00:00Z')
on conflict (tenant_id) do nothing;

insert into app.landing_pages (id, tenant_id, slug, status, template, brand_name, hero_title, hero_subtitle, hero_description, cta_label, about, whatsapp, phone, email, address, business_hours, public_service_ids, public_professional_ids, gallery_file_ids, published_at, updated_at) values
  ('85000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','clinica-bella','published','editorial_clean','Clínica Bella','Tecnologia e cuidado para sua beleza','Atendimento personalizado em Macaé','Conheça nossos serviços e agende sua próxima sessão.','Agendar agora','Clínica de estética com atendimento individualizado.','5522999999999','22999999999','contato@bella.example.test','Macaé - RJ','Seg a Sex, 09h às 19h',array['40000000-0000-0000-0000-000000000001'::uuid,'40000000-0000-0000-0000-000000000002'::uuid],array['30000000-0000-0000-0000-000000000001'::uuid,'30000000-0000-0000-0000-000000000002'::uuid],array[]::uuid[],'2026-08-09T12:00:00Z','2026-08-09T12:00:00Z'),
  ('85000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','ink-studio','draft','minimal','Ink Studio','Arte autoral em cada traço',null,'Portfólio e agendamento para projetos personalizados.','Quero conversar','Estúdio de tatuagem autoral.','5522999998888','22999998888','contato@ink.example.test','Macaé - RJ','Ter a Sáb, 10h às 20h',array['40000000-0000-0000-0000-000000000003'::uuid],array['30000000-0000-0000-0000-000000000003'::uuid],array[]::uuid[],null,'2026-08-09T12:00:00Z')
on conflict (tenant_id) do nothing;

commit;

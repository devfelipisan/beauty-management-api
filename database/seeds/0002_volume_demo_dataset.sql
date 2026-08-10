begin;
set local timezone = 'UTC';

-- Deterministic high-volume dataset for local/dev/test.
-- Extends 0001_demo_use_cases.sql and intentionally uses stable UUIDs.

-- Tenants --------------------------------------------------------------------
insert into app.tenants (id, legal_name, display_name, document, timezone, status, public_slug, created_at) values
 ('10000000-0000-0000-0000-000000000003','Essenza Spa LTDA','Essenza Spa','33445566000177','America/Sao_Paulo','trial','essenza-spa','2026-01-15T12:00:00Z'),
 ('10000000-0000-0000-0000-000000000004','Studio Aurora Estetica LTDA','Studio Aurora','55667788000199','America/Sao_Paulo','suspended','studio-aurora','2025-11-10T12:00:00Z')
on conflict (id) do update set status=excluded.status, public_slug=excluded.public_slug, display_name=excluded.display_name;

insert into app.tenant_brandings (tenant_id,primary_color,secondary_color,updated_at)
select id,
 case right(id::text,1) when '1' then '#A44F67' when '2' then '#202124' when '3' then '#6F7C72' else '#8A6652' end,
 case right(id::text,1) when '1' then '#C88698' when '2' then '#6F42C1' when '3' then '#C7B9A7' else '#D7B89D' end,
 '2026-08-10T12:00:00Z'::timestamptz
from app.tenants where id::text like '10000000-0000-0000-0000-00000000000%'
on conflict (tenant_id) do update set primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,updated_at=excluded.updated_at;

insert into app.tenant_settings (
 tenant_id,display_name,legal_name,document,phone,email,address,city,state,postal_code,primary_unit_name,
 timezone,locale,currency,week_starts_on,theme_mode,interface_density,radius,short_name,show_brand_name,
 show_breadcrumbs,show_dashboard_shortcuts,compact_navigation,default_agenda_view,session_timeout_minutes,
 logout_on_inactivity,privacy_contact,plan_name,license_status,updated_at)
select id,display_name,legal_name,document,'+55222777000'||right(id::text,1),
 replace(public_slug,'-','.')||'@example.test','Avenida Demo, '||(100+right(id::text,1)::int),'Macaé','RJ','27900-000',
 'Unidade Principal',timezone,'pt-BR','BRL','monday',case when right(id::text,1)='2' then 'dark' else 'system' end,
 'comfortable','soft',display_name,true,true,true,false,'week',60,true,'privacidade+'||public_slug||'@example.test',
 case when status='trial' then 'Trial' else 'Professional' end,
 case when status='suspended' then 'suspended' when status='trial' then 'trial' else 'active' end,
 '2026-08-10T12:00:00Z'::timestamptz
from app.tenants where id::text like '10000000-0000-0000-0000-00000000000%'
on conflict (tenant_id) do update set display_name=excluded.display_name,plan_name=excluded.plan_name,license_status=excluded.license_status,updated_at=excluded.updated_at;

insert into app.landing_pages (
 id,tenant_id,slug,status,template,brand_name,hero_title,hero_subtitle,hero_description,cta_label,about,
 whatsapp,phone,email,address,business_hours,instagram,facebook,public_service_ids,public_professional_ids,
 gallery_file_ids,published_at,updated_at)
select md5('volume:landing:'||id)::uuid,id,public_slug,
 case right(id::text,1) when '1' then 'published' when '2' then 'published' when '3' then 'draft' else 'hidden' end,
 case right(id::text,1) when '1' then 'editorial_clean' when '2' then 'minimal' else 'institutional_light' end,
 display_name,'Cuidado, técnica e experiência em cada atendimento','Atendimento personalizado por especialistas',
 'Conheça serviços e profissionais e registre seu interesse sem compromisso de agendamento.','Quero receber informações',
 'Ambiente demonstrativo do Beauty Management.','+552299999000'||right(id::text,1),'+55222777000'||right(id::text,1),
 replace(public_slug,'-','.')||'@example.test','Macaé - RJ','Segunda a sábado, conforme agenda',
 'https://instagram.com/'||replace(public_slug,'-',''),null,'{}'::uuid[],'{}'::uuid[],'{}'::uuid[],
 case when right(id::text,1) in ('1','2') then '2026-08-01T12:00:00Z'::timestamptz end,'2026-08-10T12:00:00Z'::timestamptz
from app.tenants where id::text like '10000000-0000-0000-0000-00000000000%'
on conflict (tenant_id) do update set slug=excluded.slug,status=excluded.status,template=excluded.template,brand_name=excluded.brand_name,updated_at=excluded.updated_at;

-- Identity: 41 generated + 4 base users = 45 --------------------------------
with x as (
 select g,md5('volume:user:'||g)::uuid uid,md5('volume:auth:'||g)::uuid auth,
 case when g<=15 then '10000000-0000-0000-0000-000000000001'::uuid when g<=26 then '10000000-0000-0000-0000-000000000002'::uuid
      when g<=35 then '10000000-0000-0000-0000-000000000003'::uuid else '10000000-0000-0000-0000-000000000004'::uuid end tid
 from generate_series(1,41) g)
insert into identity.users(id,auth_subject,full_name,email,status,created_at)
select uid,auth,'Usuário Demonstração '||lpad(g::text,2,'0'),'usuario.'||lpad(g::text,2,'0')||'@example.test',
 case when g in(14,32,41) then 'suspended' else 'active' end,'2026-01-01T12:00:00Z'::timestamptz+(g||' hours')::interval from x
on conflict (id) do nothing;

with x as (
 select g,md5('volume:user:'||g)::uuid uid,md5('volume:membership:'||g)::uuid mid,
 case when g<=15 then '10000000-0000-0000-0000-000000000001'::uuid when g<=26 then '10000000-0000-0000-0000-000000000002'::uuid
      when g<=35 then '10000000-0000-0000-0000-000000000003'::uuid else '10000000-0000-0000-0000-000000000004'::uuid end tid
 from generate_series(1,41) g)
insert into identity.tenant_memberships(id,tenant_id,user_id,status,created_at,joined_at)
select mid,tid,uid,case when g in(14,32,41) then 'suspended' else 'active' end,'2026-01-01T12:00:00Z','2026-01-02T12:00:00Z' from x
on conflict (tenant_id,user_id) do nothing;

with x as (
 select g,md5('volume:membership:'||g)::uuid mid,
 case when g<=15 then '10000000-0000-0000-0000-000000000001'::uuid when g<=26 then '10000000-0000-0000-0000-000000000002'::uuid
      when g<=35 then '10000000-0000-0000-0000-000000000003'::uuid else '10000000-0000-0000-0000-000000000004'::uuid end tid,
 case when g%11=0 then 'tenant_admin' when g%4=0 then 'reception' else 'professional' end role_code
 from generate_series(1,41) g)
insert into identity.membership_roles(tenant_id,membership_id,role_id)
select x.tid,x.mid,r.id from x join identity.roles r on r.tenant_id=x.tid and r.code=x.role_code on conflict do nothing;

-- Professionals: 21 generated + 3 base = 24 ---------------------------------
with cfg as (select * from(values
 ('10000000-0000-0000-0000-000000000001'::uuid,7,'Bella','Estética e laser'),
 ('10000000-0000-0000-0000-000000000002'::uuid,5,'Ink','Tatuagem'),
 ('10000000-0000-0000-0000-000000000003'::uuid,5,'Essenza','Massoterapia e estética'),
 ('10000000-0000-0000-0000-000000000004'::uuid,4,'Aurora','Estética e bem-estar'))c(tid,n,prefix,specialty)),x as(
 select c.*,g from cfg c cross join lateral generate_series(1,c.n)g)
insert into app.professionals(id,tenant_id,display_name,specialty,active,created_at)
select md5('volume:professional:'||tid||':'||g)::uuid,tid,prefix||' Profissional '||lpad(g::text,2,'0'),specialty,
 not(tid='10000000-0000-0000-0000-000000000004' and g=4),'2025-12-01T12:00:00Z'::timestamptz+(g||' days')::interval from x
on conflict(id) do nothing;

-- Services: 42 generated + 3 base = 45 --------------------------------------
with cfg as(select * from(values
 ('10000000-0000-0000-0000-000000000001'::uuid,12,'Bella'),('10000000-0000-0000-0000-000000000002'::uuid,10,'Ink'),
 ('10000000-0000-0000-0000-000000000003'::uuid,10,'Essenza'),('10000000-0000-0000-0000-000000000004'::uuid,10,'Aurora'))c(tid,n,prefix)),x as(
 select c.*,g from cfg c cross join lateral generate_series(1,c.n)g)
insert into app.services(id,tenant_id,name,category,duration_minutes,price_cents,active,deposit_required,deposit_type,deposit_value,assessment_required,created_at)
select md5('volume:service:'||tid||':'||g)::uuid,tid,
 case when prefix='Ink' then 'Projeto de tatuagem '||lpad(g::text,2,'0') when g%4=0 then 'Massagem corporal '||lpad(g::text,2,'0')
      when g%3=0 then 'Procedimento facial '||lpad(g::text,2,'0') else 'Procedimento laser '||lpad(g::text,2,'0') end,
 case when prefix='Ink' then 'tatuagem' when g%4=0 then 'massagem' when g%3=0 then 'facial' else 'laser' end,
 case when prefix='Ink' then 90+(g%2)*30 else 30+(g%4)*15 end,(9000+g*1700+case when prefix='Ink' then 18000 else 0 end)::bigint,
 not(g=n and prefix='Aurora'),g%3<>0,case when g%3<>0 then 'percentage' else 'none' end,case when g%3<>0 then 20+(g%2)*10 else 0 end,
 prefix='Ink' or g%4=1,'2025-12-01T12:00:00Z' from x on conflict(id) do nothing;

insert into app.professional_services(tenant_id,professional_id,service_id)
select s.tenant_id,p.id,s.id from app.services s join lateral(
 select id from app.professionals p where p.tenant_id=s.tenant_id and p.active order by id limit 2)p on true
where s.active and s.tenant_id::text like '10000000-0000-0000-0000-00000000000%' on conflict do nothing;

-- Equipment: 16 generated + 2 base = 18 -------------------------------------
with x as(select g,case when g<=6 then '10000000-0000-0000-0000-000000000001'::uuid when g<=10 then '10000000-0000-0000-0000-000000000002'::uuid
 when g<=13 then '10000000-0000-0000-0000-000000000003'::uuid else '10000000-0000-0000-0000-000000000004'::uuid end tid from generate_series(1,16)g)
insert into app.equipment(id,tenant_id,name,model,manufacturer,serial_number,primary_unit,status,notes,usage_count,created_at,updated_at)
select md5('volume:equipment:'||g)::uuid,tid,case when g between 7 and 10 then 'Máquina Tattoo ' else 'Equipamento Estético ' end||lpad(g::text,2,'0'),
 'MODEL-'||lpad(g::text,3,'0'),case when g between 7 and 10 then 'InkTools' else 'DemoMed' end,'DEMO-'||lpad(g::text,6,'0'),
 case when g between 7 and 10 then 'rpm' else 'J/cm²' end,case when g in(5,12)then'maintenance' when g in(9,15)then'blocked' when g in(10,16)then'inactive' else'available'end,
 'Equipamento de demonstração.',(g*23)%170,'2025-12-01T12:00:00Z','2026-08-10T12:00:00Z' from x on conflict(id) do nothing;

insert into app.equipment_services(tenant_id,equipment_id,service_id)
select e.tenant_id,e.id,s.id from app.equipment e join lateral(select id from app.services s where s.tenant_id=e.tenant_id and s.active order by id limit 3)s on true
where e.tenant_id::text like '10000000-0000-0000-0000-00000000000%' on conflict do nothing;

-- Customers: 1,496 generated + 4 base >= 1,500 ------------------------------
with x as(select g,case when g<=600 then '10000000-0000-0000-0000-000000000001'::uuid when g<=1050 then '10000000-0000-0000-0000-000000000002'::uuid
 when g<=1400 then '10000000-0000-0000-0000-000000000003'::uuid else '10000000-0000-0000-0000-000000000004'::uuid end tid from generate_series(1,1496)g)
insert into app.customers(id,tenant_id,full_name,phone,email,status,relationship_profile,created_at,updated_at)
select md5('volume:customer:'||g)::uuid,tid,'Cliente Demonstração '||lpad(g::text,4,'0'),'+55229'||lpad(g::text,8,'0'),
 case when g%7=0 then null else 'cliente.'||lpad(g::text,4,'0')||'@example.test' end,
 case when g%10=8 then'inactive' when g%37=0 then'blocked' else'active'end,
 (array['new','new','returning','returning','returning','loyal','loyal','loyal','inactive','frequent_no_show'])[1+(g%10)],
 '2025-02-01T12:00:00Z'::timestamptz+((g%500)||' days')::interval,'2026-08-10T12:00:00Z'::timestamptz-((g%90)||' days')::interval from x
on conflict(id) do nothing;

-- Appointments: 8,000 generated journeys. Active appointments use globally
-- unique 4-hour slots, safely above the maximum seeded service duration.
with ps as(
 select ps.tenant_id,ps.professional_id,ps.service_id,row_number()over(order by ps.tenant_id,ps.professional_id,ps.service_id)rn,count(*)over()total
 from app.professional_services ps join app.professionals p on p.tenant_id=ps.tenant_id and p.id=ps.professional_id and p.active
 join app.services s on s.tenant_id=ps.tenant_id and s.id=ps.service_id and s.active
 where ps.tenant_id::text like '10000000-0000-0000-0000-00000000000%'),
cb as(select tenant_id,array_agg(id order by id)ids,count(*)::int cnt from app.customers group by tenant_id),
x as(
 select g,ps.tenant_id,ps.professional_id,ps.service_id,cb.ids[1+((g-1)%cb.cnt)]customer_id,s.duration_minutes,s.price_cents,s.deposit_required,s.deposit_value,
 case when g<=700 then '2026-08-11T08:00:00Z'::timestamptz+g*interval'4 hours' else '2026-08-10T18:00:00Z'::timestamptz-(g-700)*interval'95 minutes'end starts_at,
 case when g<=700 then (array['awaiting_deposit','awaiting_confirmation','confirmed','checked_in','in_progress'])[1+((g-1)%5)]
      else case g%20 when 14 then'rescheduled' when 15 then'canceled' when 16 then'no_show' when 17 then'expired' else'completed'end end status,
 (array['landing_page','reception','whatsapp','return','campaign','referral','manual'])[1+((g-1)%7)]origin,
 case when g%5=0 then10 when g%3=0 then5 else0 end discount_pct
 from generate_series(1,8000)g join ps on ps.rn=1+((g-1)%ps.total) join cb on cb.tenant_id=ps.tenant_id
 join app.services s on s.tenant_id=ps.tenant_id and s.id=ps.service_id)
insert into app.appointments(id,tenant_id,customer_id,professional_id,service_id,starts_at,ends_at,status,base_price_cents,discount_cents,final_price_cents,deposit_cents,origin,created_at,updated_at)
select md5('volume:appointment:'||g)::uuid,tenant_id,customer_id,professional_id,service_id,starts_at,starts_at+(duration_minutes||' minutes')::interval,status,price_cents,
 floor(price_cents*discount_pct/100.0)::bigint,price_cents-floor(price_cents*discount_pct/100.0)::bigint,
 case when deposit_required then floor((price_cents-floor(price_cents*discount_pct/100.0)::bigint)*deposit_value/100.0)::bigint else0 end,origin,
 starts_at-interval'7 days',starts_at-interval'1 day' from x on conflict(id) do nothing;

-- Deposits: first 5,000 generated appointments -------------------------------
with x as(select a.*,row_number()over(order by a.id)rn from app.appointments a
 where a.id in(select md5('volume:appointment:'||g)::uuid from generate_series(1,8000)g)),s as(select*from x where rn<=5000)
insert into app.deposits(id,tenant_id,appointment_id,amount_cents,status,payment_method,confirmed_at,confirmed_by,created_at)
select md5('volume:deposit:'||rn)::uuid,tenant_id,id,deposit_cents,
 case when deposit_cents=0 then'not_required' when status='awaiting_deposit' then(array['awaiting_payment','proof_submitted','under_review','rejected'])[1+((rn-1)%4)]
      when status='expired'then'expired' when status='canceled'then(array['refunded','retained','credit'])[1+((rn-1)%3)] when status='no_show'then'retained'
      when status='rescheduled'and rn%3=0 then'credit' else'confirmed'end,
 case when deposit_cents=0 then null else(array['pix','credit_card','transfer'])[1+((rn-1)%3)]end,
 case when deposit_cents>0 and status not in('awaiting_deposit','expired','canceled','no_show')then starts_at-interval'2 days'end,null,created_at+interval'1 hour'
from s on conflict(tenant_id,appointment_id)do nothing;

-- Sessions: 4,500 from completed/in-progress appointments --------------------
with x as(select a.*,row_number()over(order by a.starts_at,a.id)rn from app.appointments a
 where a.id in(select md5('volume:appointment:'||g)::uuid from generate_series(1,8000)g)and a.status in('completed','in_progress')
 and not exists(select 1 from app.sessions s where s.tenant_id=a.tenant_id and s.appointment_id=a.id)),s as(select*from x where rn<=4500)
insert into app.sessions(id,tenant_id,appointment_id,customer_id,professional_id,service_id,status,started_at,completed_at,technical_form_version)
select md5('volume:session:'||rn)::uuid,tenant_id,id,customer_id,professional_id,service_id,case when status='in_progress'then'in_progress'else'completed'end,
 starts_at,case when status='completed'then ends_at end,1+(rn%3) from s on conflict(tenant_id,appointment_id)do nothing;

-- Assessments: 950 -----------------------------------------------------------
with x as(select a.*,row_number()over(order by a.id)rn from app.appointments a where a.id in(select md5('volume:appointment:'||g)::uuid from generate_series(1,8000)g))
insert into app.assessments(id,tenant_id,customer_id,service_id,professional_id,result,restrictions,valid_until,created_at)
select md5('volume:assessment:'||rn)::uuid,tenant_id,customer_id,service_id,professional_id,
 case when rn%20 in(0,1)then'not_fit' when rn%10 in(2,3)then'fit_with_restrictions'else'fit'end,
 case when rn%10 in(2,3)then array['sensibilidade elevada','reavaliar parâmetros']::text[] else'{}'::text[]end,
 case when rn%19=0 then starts_at-interval'1 day'else starts_at+interval'180 days'end,created_at from x where rn<=950 on conflict(id)do nothing;

-- Technical history: 12,000 --------------------------------------------------
with sp as(select s.*,row_number()over(order by s.id)rn,count(*)over()total from app.sessions s
 where s.id in(select md5('volume:session:'||g)::uuid from generate_series(1,4500)g)),
eb as(select tenant_id,array_agg(id order by id)ids,count(*)::int cnt from app.equipment group by tenant_id),x as(
 select g,sp.*,eb.ids equipment_ids,eb.cnt equipment_count from generate_series(1,12000)g join sp on sp.rn=1+((g-1)%sp.total)left join eb on eb.tenant_id=sp.tenant_id)
insert into app.technical_records(id,tenant_id,session_id,region,equipment_id,power,power_unit,reaction,notes,created_at)
select md5('volume:technical-record:'||g)::uuid,tenant_id,id,(array['face','axilas','pernas','virilha','antebraço','costas'])[1+((g-1)%6)],
 case when equipment_count is null then null else equipment_ids[1+((g-1)%equipment_count)]end,case when g%8=0 then null else12+(g%11)end,
 case when g%8=0 then null else'J/cm²'end,(array['normal','sensibilidade leve','eritema discreto','sem reação','sensibilidade moderada'])[1+((g-1)%5)],
 case when g%37=0 then'Ajuste de parâmetro após reação anterior.'else'Registro técnico de demonstração.'end,coalesce(completed_at,started_at)+(g%3)*interval'1 minute'
from x on conflict(id)do nothing;

-- Packages: 700; movements: 2,500 -------------------------------------------
with cp as(select c.*,row_number()over(order by c.id)rn,count(*)over()total from app.customers c),sb as(
 select tenant_id,array_agg(id order by id)ids,count(*)::int cnt from app.services where active group by tenant_id),x as(
 select g,cp.*,sb.ids service_ids,sb.cnt service_count,case when g%5=0 then6 when g%5=1 then8 when g%5=2 then10 else12 end total_sessions
 from generate_series(1,700)g join cp on cp.rn=1+((g-1)%cp.total)join sb on sb.tenant_id=cp.tenant_id)
insert into app.customer_packages(id,tenant_id,customer_id,service_id,total_sessions,used_sessions,valid_until,status,price_cents,created_at,updated_at)
select md5('volume:package:'||g)::uuid,tenant_id,id,service_ids[1+((g-1)%service_count)],total_sessions,
 case when g%10=7 then total_sessions when g%10 in(8,9)then least(total_sessions,2+(g%4))else least(total_sessions-1,g%greatest(total_sessions,1))end,
 case when g%10=8 then'2026-07-01T12:00:00Z'::timestamptz else'2027-08-10T12:00:00Z'::timestamptz end,
 case when g%10=7 then'exhausted'when g%10=8 then'expired'when g%10=9 then'canceled'else'active'end,(total_sessions*(7000+(g%5)*1000))::bigint,
 '2025-10-01T12:00:00Z'::timestamptz+((g%250)||' days')::interval,'2026-08-10T12:00:00Z' from x on conflict(id)do nothing;

with pp as(select p.*,row_number()over(order by p.id)rn,count(*)over()total from app.customer_packages p
 where p.id in(select md5('volume:package:'||g)::uuid from generate_series(1,700)g)),x as(
 select g,pp.* from generate_series(1,2500)g join pp on pp.rn=1+((g-1)%pp.total))
insert into app.package_movements(id,tenant_id,package_id,session_id,quantity,movement_type,reason,created_at)
select md5('volume:package-movement:'||g)::uuid,tenant_id,id,null,1,
 case when g<=2200 then'consume'when g<=2350 then'reverse'else'adjust'end,
 case when g<=2200 then'Consumo histórico demonstrativo.'when g<=2350 then'Estorno administrativo demonstrativo.'else'Ajuste auditável demonstrativo.'end,
 created_at+(g%365)*interval'1 day' from x on conflict(id)do nothing;

-- Payments: 6,500 ------------------------------------------------------------
with x as(select a.*,row_number()over(order by a.id)rn from app.appointments a where a.id in(select md5('volume:appointment:'||g)::uuid from generate_series(1,8000)g))
insert into app.payments(id,tenant_id,customer_id,origin_type,origin_id,amount_cents,method,status,paid_at,created_at)
select md5('volume:payment:'||rn)::uuid,tenant_id,customer_id,(array['appointment','session','package','credit','other'])[1+((rn-1)%5)],id,
 greatest(final_price_cents-case when rn%4=0 then deposit_cents else0 end,0),(array['cash','pix','debit_card','credit_card','transfer','internal_credit'])[1+((rn-1)%6)],
 case when rn%20=0 then'refunded'when rn%17=0 then'canceled'when rn%11=0 then'partial'when rn%7=0 then'pending'else'paid'end,
 case when rn%7<>0 then ends_at+interval'10 minutes'end,created_at+interval'2 hours' from x where rn<=6500 on conflict(id)do nothing;

-- Follow-ups: 2,000 ----------------------------------------------------------
with x as(select s.*,row_number()over(order by s.id)rn from app.sessions s where s.status='completed'and s.id in(select md5('volume:session:'||g)::uuid from generate_series(1,4500)g)),y as(
 select x.*,f.id future_id from x left join lateral(select a.id from app.appointments a where a.tenant_id=x.tenant_id and a.customer_id=x.customer_id
 and a.starts_at>coalesce(x.completed_at,x.started_at)and a.status in('awaiting_deposit','awaiting_confirmation','confirmed','checked_in')order by a.starts_at limit1)f on true where rn<=2000)
insert into app.follow_ups(id,tenant_id,customer_id,session_id,suggested_at,reason,appointment_id,status,created_at,updated_at)
select md5('volume:follow-up:'||rn)::uuid,tenant_id,customer_id,id,coalesce(completed_at,started_at)+((21+rn%70)||' days')::interval,'Retorno recomendado.',
 case when rn%4=1 and future_id is not null then future_id end,
 case when rn%4=1 and future_id is not null then'scheduled'when rn%4=2 then'completed'when rn%4=3 then'canceled'else'pending'end,
 coalesce(completed_at,started_at),'2026-08-10T12:00:00Z' from y on conflict(id)do nothing;

-- Leads: 1,200; newsletter/contact records do not auto-create appointments ---
with tp as(select id,row_number()over(order by id)rn,count(*)over()total from app.tenants where id::text like'10000000-0000-0000-0000-00000000000%'),
cb as(select tenant_id,array_agg(id order by id)ids,count(*)::int cnt from app.customers group by tenant_id),
sb as(select tenant_id,array_agg(id order by id)ids,count(*)::int cnt from app.services where active group by tenant_id),
pb as(select tenant_id,array_agg(id order by id)ids,count(*)::int cnt from app.professionals where active group by tenant_id),
ab as(select tenant_id,array_agg(id order by id)ids,count(*)::int cnt from app.appointments group by tenant_id),x as(
 select g,tp.id tid,cb.ids cids,cb.cnt cc,sb.ids sids,sb.cnt sc,pb.ids pids,pb.cnt pc,ab.ids aids,ab.cnt ac from generate_series(1,1200)g
 join tp on tp.rn=1+((g-1)%tp.total)join cb on cb.tenant_id=tp.id join sb on sb.tenant_id=tp.id join pb on pb.tenant_id=tp.id join ab on ab.tenant_id=tp.id)
insert into app.leads(id,tenant_id,full_name,phone,email,service_id,professional_id,desired_period,notes,origin,privacy_consent_at,marketing_consent_at,status,customer_id,appointment_id,created_at,updated_at)
select md5('volume:lead:'||g)::uuid,tid,'Lead Demonstração '||lpad(g::text,4,'0'),case when g%5=0 then null else'+55228'||lpad(g::text,8,'0')end,
 case when g%5=0 or g%3=0 then'lead.'||lpad(g::text,4,'0')||'@example.test'end,case when g%4=0 then sids[1+((g-1)%sc)]end,
 case when g%9=0 then pids[1+((g-1)%pc)]end,(array['manha','tarde','noite','sabado'])[1+((g-1)%4)],
 'Interesse registrado sem compromisso de agendamento.',(array['landing_contact','landing_newsletter','landing_service_interest','whatsapp','campaign','referral','manual'])[1+((g-1)%7)],
 '2026-01-01T12:00:00Z'::timestamptz+(g||' hours')::interval,case when g%3=0 then'2026-01-01T12:00:00Z'::timestamptz+(g||' hours')::interval end,
 (array['new','in_contact','awaiting_customer','appointment_created','converted','no_response','lost','duplicate'])[1+(g%8)],
 case when g%8 in(3,4)then cids[1+((g-1)%cc)]end,case when g%8=3 then aids[1+((g-1)%ac)]end,
 '2026-01-01T12:00:00Z'::timestamptz+(g||' hours')::interval,'2026-08-10T12:00:00Z' from x on conflict(id)do nothing;

-- Audit: 30,000 --------------------------------------------------------------
with ap as(select id,tenant_id,row_number()over(order by id)rn,count(*)over()total from app.appointments),x as(
 select g,ap.id rid,ap.tenant_id from generate_series(1,30000)g join ap on ap.rn=1+((g-1)%ap.total))
insert into audit.events(id,tenant_id,actor_id,actor_type,action,resource_type,resource_id,request_id,correlation_id,changes,metadata,occurred_at)
select md5('volume:audit:'||g)::uuid,tenant_id,null,case when g%17=0 then'system'when g%9=0 then'worker'else'user'end,
 (array['appointment.created','appointment.confirmed','deposit.confirmed','session.started','session.completed','payment.registered','package.consumed','lead.created','follow-up.created','customer.profile.changed'])[1+((g-1)%10)],
 'appointment',rid,'seed-request-'||g,'seed-correlation-'||(1+g%4000),jsonb_build_object('seed',true,'sequence',g),jsonb_build_object('dataset','demo-dataset-v1'),
 '2025-01-01T00:00:00Z'::timestamptz+g*interval'20 minutes' from x on conflict(id)do nothing;

-- Outbox: 12,000 -------------------------------------------------------------
with ap as(select id,tenant_id,row_number()over(order by id)rn,count(*)over()total from app.appointments),x as(
 select g,ap.id rid,ap.tenant_id from generate_series(1,12000)g join ap on ap.rn=1+((g-1)%ap.total))
insert into app.outbox_events(id,tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload,status,attempts,created_at,published_at,last_error)
select md5('volume:outbox:'||g)::uuid,tenant_id,
 (array['appointment.created','deposit.pending','deposit.confirmed','presence.pending','customer.arrived','session.completed','follow-up.due','lead.received','package.low-balance','license.expiring'])[1+((g-1)%10)],
 'appointment',rid,'seed-outbox-'||(1+g%2500),jsonb_build_object('seed',true,'appointmentId',rid),
 case when g%40=0 then'failed'when g%31=0 then'processing'when g%7=0 then'pending'else'published'end,
 case when g%40=0 then3 when g%31=0 then1 else0 end,'2025-10-01T00:00:00Z'::timestamptz+g*interval'15 minutes',
 case when g%40<>0 and g%31<>0 and g%7<>0 then'2025-10-01T00:05:00Z'::timestamptz+g*interval'15 minutes'end,
 case when g%40=0 then'Falha simulada para retry.'end from x on conflict(id)do nothing;

-- Idempotency: 8,000 ---------------------------------------------------------
with ap as(select id,tenant_id,row_number()over(order by id)rn,count(*)over()total from app.appointments),x as(
 select g,ap.id rid,ap.tenant_id from generate_series(1,8000)g join ap on ap.rn=1+((g-1)%ap.total))
insert into app.idempotency_keys(id,tenant_id,idempotency_key,operation,request_hash,status,response,expires_at,created_at,updated_at)
select md5('volume:idempotency:'||g)::uuid,tenant_id,'seed-key-'||lpad(g::text,6,'0'),
 (array['appointment.create','deposit.confirm','session.start','session.complete','payment.register','payment.refund','package.consume'])[1+((g-1)%7)],md5('request:'||g),
 case when g%29=0 then'failed'when g%23=0 then'processing'else'completed'end,
 case when g%29<>0 and g%23<>0 then jsonb_build_object('resourceId',rid,'seed',true)end,
 '2027-08-10T12:00:00Z'::timestamptz+((g%30)||' days')::interval,'2026-01-01T00:00:00Z'::timestamptz+g*interval'5 minutes',
 '2026-01-01T00:01:00Z'::timestamptz+g*interval'5 minutes' from x on conflict(tenant_id,operation,idempotency_key)do nothing;

-- Publish current service/professional catalogs on each tenant landing page.
update app.landing_pages lp set
 public_service_ids=coalesce((select array_agg(id order by name)from app.services s where s.tenant_id=lp.tenant_id and s.active),'{}'::uuid[]),
 public_professional_ids=coalesce((select array_agg(id order by display_name)from app.professionals p where p.tenant_id=lp.tenant_id and p.active),'{}'::uuid[]),
 updated_at='2026-08-10T12:00:00Z'
where lp.tenant_id::text like'10000000-0000-0000-0000-00000000000%';

commit;

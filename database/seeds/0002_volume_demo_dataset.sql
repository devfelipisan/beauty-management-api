begin;
set local timezone = 'UTC';

-- Reference tenants ----------------------------------------------------------
insert into app.tenants (id,legal_name,display_name,document,timezone,status,public_slug,created_at) values
 ('10000000-0000-0000-0000-000000000003','Essenza Spa LTDA','Essenza Spa','33445566000177','America/Sao_Paulo','trial','essenza-spa','2026-01-15T12:00:00Z'),
 ('10000000-0000-0000-0000-000000000004','Studio Aurora Estetica LTDA','Studio Aurora','55667788000199','America/Sao_Paulo','suspended','studio-aurora','2025-11-10T12:00:00Z')
on conflict (id) do update set status=excluded.status,public_slug=excluded.public_slug,display_name=excluded.display_name;

-- Settings and landing pages -------------------------------------------------
insert into app.tenant_settings (tenant_id,display_name,legal_name,document,timezone,locale,currency,week_starts_on,theme_mode,interface_density,radius,
 show_brand_name,show_breadcrumbs,show_dashboard_shortcuts,compact_navigation,default_agenda_view,session_timeout_minutes,logout_on_inactivity,plan_name,license_status,updated_at)
select id,display_name,legal_name,document,timezone,'pt-BR','BRL','monday','system','comfortable','soft',true,true,true,false,'week',60,true,
 case when status='trial' then 'Trial' else 'Professional' end,case when status='suspended' then 'suspended' when status='trial' then 'trial' else 'active' end,'2026-08-10T12:00:00Z'
from app.tenants where id::text like '10000000-0000-0000-0000-00000000000%'
on conflict (tenant_id) do nothing;

insert into app.landing_pages (id,tenant_id,slug,status,template,brand_name,hero_title,cta_label,public_service_ids,public_professional_ids,gallery_file_ids,published_at,updated_at)
select md5('landing:'||id)::uuid,id,public_slug,
 case right(id::text,1) when '1' then 'published' when '2' then 'published' when '3' then 'draft' else 'hidden' end,
 'editorial_clean',display_name,'Cuidado, técnica e experiência em cada atendimento','Quero receber informações','{}'::uuid[],'{}'::uuid[],'{}'::uuid[],
 case when right(id::text,1) in ('1','2') then '2026-08-01T12:00:00Z'::timestamptz end,'2026-08-10T12:00:00Z'
from app.tenants where id::text like '10000000-0000-0000-0000-00000000000%'
on conflict (tenant_id) do nothing;

-- Professionals: 24 generated (+ compact fixture records) -------------------
with cfg as (
 select * from (values
 ('10000000-0000-0000-0000-000000000001'::uuid,7,'Bella'),('10000000-0000-0000-0000-000000000002'::uuid,6,'Ink'),
 ('10000000-0000-0000-0000-000000000003'::uuid,6,'Essenza'),('10000000-0000-0000-0000-000000000004'::uuid,5,'Aurora')) c(tenant_id,n,prefix)
), rows as (select c.*,g from cfg c cross join lateral generate_series(1,c.n) g)
insert into app.professionals (id,tenant_id,display_name,specialty,active,created_at)
select md5('professional:'||tenant_id||':'||g)::uuid,tenant_id,prefix||' Profissional '||lpad(g::text,2,'0'),
 case when prefix='Ink' then 'Tatuagem' else 'Estética e serviços por sessão' end,not(prefix='Aurora' and g=5),'2025-12-01T12:00:00Z'::timestamptz+(g||' days')::interval
from rows on conflict (id) do nothing;

-- Services: 45 generated -----------------------------------------------------
with cfg as (
 select * from (values
 ('10000000-0000-0000-0000-000000000001'::uuid,12,'Bella'),('10000000-0000-0000-0000-000000000002'::uuid,11,'Ink'),
 ('10000000-0000-0000-0000-000000000003'::uuid,11,'Essenza'),('10000000-0000-0000-0000-000000000004'::uuid,11,'Aurora')) c(tenant_id,n,prefix)
), rows as (select c.*,g from cfg c cross join lateral generate_series(1,c.n) g)
insert into app.services (id,tenant_id,name,category,duration_minutes,price_cents,active,deposit_required,deposit_type,deposit_value,assessment_required,created_at)
select md5('service:'||tenant_id||':'||g)::uuid,tenant_id,
 case when prefix='Ink' then 'Tatuagem '||lpad(g::text,2,'0') when g%3=0 then 'Procedimento facial '||lpad(g::text,2,'0') else 'Procedimento laser '||lpad(g::text,2,'0') end,
 case when prefix='Ink' then 'tatuagem' when g%3=0 then 'facial' else 'laser' end,case when prefix='Ink' then 120 else 30+(g%4)*15 end,
 9000+g*1700+case when prefix='Ink' then 18000 else 0 end,true,g%3<>0,case when g%3<>0 then 'percentage' else 'none' end,
 case when g%3<>0 then 20 else 0 end,g%4=0,'2025-12-01T12:00:00Z'
from rows on conflict (id) do nothing;

insert into app.professional_services (tenant_id,professional_id,service_id)
select p.tenant_id,p.id,s.id from app.professionals p join lateral (
 select id from app.services s where s.tenant_id=p.tenant_id order by id limit 4
) s on true
where p.id::text not like '30000000-%'
on conflict do nothing;

-- Equipment: 18 total with compact fixture ----------------------------------
with rows as (select g,case when g<=6 then '10000000-0000-0000-0000-000000000001'::uuid when g<=10 then '10000000-0000-0000-0000-000000000002'::uuid when g<=14 then '10000000-0000-0000-0000-000000000003'::uuid else '10000000-0000-0000-0000-000000000004'::uuid end tenant_id from generate_series(1,16) g)
insert into app.equipment (id,tenant_id,name,model,manufacturer,serial_number,primary_unit,status,notes,usage_count,created_at,updated_at)
select md5('equipment:'||g)::uuid,tenant_id,'Equipamento '||lpad(g::text,2,'0'),'MODEL-'||g,'DemoMed','SER-'||g,'unit',
 (array['available','available','available','maintenance','blocked','inactive'])[(g%6)+1], 'Massa de dados PostgreSQL',g*7,'2025-12-01T12:00:00Z','2026-08-10T12:00:00Z'
from rows on conflict (id) do nothing;

-- Customers: 1,500 total with compact fixture --------------------------------
with rows as (select g,case when g<=600 then '10000000-0000-0000-0000-000000000001'::uuid when g<=1000 then '10000000-0000-0000-0000-000000000002'::uuid when g<=1300 then '10000000-0000-0000-0000-000000000003'::uuid else '10000000-0000-0000-0000-000000000004'::uuid end tenant_id from generate_series(1,1496) g)
insert into app.customers (id,tenant_id,full_name,phone,email,status,relationship_profile,created_at,updated_at)
select md5('customer:'||g)::uuid,tenant_id,'Cliente Demonstração '||lpad(g::text,4,'0'),'229'||lpad(g::text,8,'0'),'cliente.'||g||'@example.test',
 case when g%17=0 then 'inactive' when g%43=0 then 'blocked' else 'active' end,
 (array['new','returning','loyal','inactive','frequent_no_show'])[(g%5)+1],
 '2025-01-01T12:00:00Z'::timestamptz+(g%500||' days')::interval,'2026-08-10T12:00:00Z'
from rows on conflict (id) do nothing;

-- Appointments: 8,000 total. Generated time slots are globally unique so the
-- database exclusion constraint remains active while the seed is inserted.
with refs as (
 select t.id tenant_id,array_agg(distinct c.id order by c.id) customers,array_agg(distinct p.id order by p.id) professionals,array_agg(distinct s.id order by s.id) services
 from app.tenants t join app.customers c on c.tenant_id=t.id join app.professionals p on p.tenant_id=t.id join app.services s on s.tenant_id=t.id
 where t.id::text like '10000000-0000-0000-0000-00000000000%' group by t.id
), rows as (
 select g,(array['10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000004'::uuid])[(g%4)+1] tenant_id
 from generate_series(1,7994) g
), data as (
 select r.g,r.tenant_id,rf.customers[(r.g%cardinality(rf.customers))+1] customer_id,rf.professionals[(r.g%cardinality(rf.professionals))+1] professional_id,
 rf.services[(r.g%cardinality(rf.services))+1] service_id from rows r join refs rf on rf.tenant_id=r.tenant_id
)
insert into app.appointments (id,tenant_id,customer_id,professional_id,service_id,starts_at,ends_at,status,base_price_cents,discount_cents,final_price_cents,deposit_cents,origin,created_at,updated_at)
select md5('appointment:'||g)::uuid,tenant_id,customer_id,professional_id,service_id,
 '2024-01-01T08:00:00Z'::timestamptz+(g*interval '2 hours'), '2024-01-01T09:00:00Z'::timestamptz+(g*interval '2 hours'),
 case when g%100<56 then 'completed' when g%100<64 then 'confirmed' when g%100<70 then 'awaiting_deposit' when g%100<76 then 'awaiting_confirmation'
      when g%100<81 then 'no_show' when g%100<86 then 'canceled' when g%100<91 then 'rescheduled' when g%100<95 then 'expired' when g%100<98 then 'checked_in' else 'in_progress' end,
 15000,case when g%7=0 then 1500 else 0 end,15000-case when g%7=0 then 1500 else 0 end,case when g%3=0 then 3000 else 0 end,
 (array['reception','landing_page','whatsapp','return','campaign','referral','manual'])[(g%7)+1],'2023-12-01T12:00:00Z','2026-08-10T12:00:00Z'
from data on conflict (id) do nothing;

-- Deposits: 5,000 ------------------------------------------------------------
with candidates as (
 select a.*,row_number() over(order by a.id) rn from app.appointments a order by a.id limit 5000
)
insert into app.deposits (id,tenant_id,appointment_id,amount_cents,status,payment_method,confirmed_at,created_at)
select md5('deposit:'||rn)::uuid,tenant_id,id,deposit_cents,
 (array['not_required','awaiting_payment','proof_submitted','under_review','confirmed','rejected','expired','refunded','retained','credit'])[(rn%10)+1],
 case when deposit_cents>0 then 'pix' end,case when rn%10=4 then updated_at end,created_at
from candidates
on conflict (tenant_id,appointment_id) do nothing;

-- Assessments: 950 -----------------------------------------------------------
insert into app.assessments (id,tenant_id,customer_id,service_id,professional_id,result,restrictions,valid_until,created_at)
select md5('assessment:'||g)::uuid,c.tenant_id,c.id,s.id,p.id,
 (array['fit','fit_with_restrictions','not_fit'])[(g%3)+1],case when g%3=1 then array['Pele sensibilizada'] else '{}'::text[] end,
 '2027-01-01T00:00:00Z','2026-01-01T12:00:00Z'
from generate_series(1,950) g
join lateral (select * from app.customers order by id offset ((g-1)%1500) limit 1) c on true
join lateral (select * from app.services where tenant_id=c.tenant_id order by id limit 1) s on true
join lateral (select * from app.professionals where tenant_id=c.tenant_id order by id limit 1) p on true
on conflict (id) do nothing;

-- Sessions: 4,500 ------------------------------------------------------------
with candidates as (
 select a.*,row_number() over(order by a.id) rn from app.appointments a where a.status in ('completed','in_progress') order by a.id limit 4500
)
insert into app.sessions (id,tenant_id,appointment_id,customer_id,professional_id,service_id,status,started_at,completed_at,technical_form_version)
select md5('session:'||rn)::uuid,tenant_id,id,customer_id,professional_id,service_id,
 case when status='in_progress' then 'in_progress' else 'completed' end,starts_at+interval '5 minutes',
 case when status='in_progress' then null else ends_at-interval '5 minutes' end,1
from candidates
on conflict (tenant_id,appointment_id) do nothing;

-- Technical records: 12,000 --------------------------------------------------
with ss as (select array_agg(id order by id) ids from app.sessions), ee as (select array_agg(id order by id) ids from app.equipment)
insert into app.technical_records (id,tenant_id,session_id,region,equipment_id,power,power_unit,reaction,notes,created_at)
select md5('technical:'||g)::uuid,s.tenant_id,s.id,case when g%2=0 then 'Face' else 'Corporal' end,
 case when e.id is not null and e.tenant_id=s.tenant_id then e.id end,12+(g%10),'J/cm²',case when g%9=0 then 'Eritema leve' else 'Sem intercorrência' end,
 case when g%11=0 then 'Ajuste de parâmetro após comparação histórica' else 'Registro técnico da sessão' end,s.started_at+(g%20||' minutes')::interval
from generate_series(1,12000) g
cross join ss
cross join ee
join app.sessions s on s.id=ss.ids[((g-1)%cardinality(ss.ids))+1]
left join app.equipment e on e.id=ee.ids[((g-1)%cardinality(ee.ids))+1]
on conflict (id) do nothing;

-- Packages: 700 and movements: 2,500 ---------------------------------------
insert into app.customer_packages (id,tenant_id,customer_id,service_id,total_sessions,used_sessions,valid_until,status,price_cents,created_at,updated_at)
select md5('package:'||g)::uuid,c.tenant_id,c.id,s.id,10,g%10,'2027-06-01T00:00:00Z',
 (array['active','active','exhausted','expired','canceled'])[(g%5)+1],90000,'2026-01-01T12:00:00Z','2026-08-10T12:00:00Z'
from generate_series(1,700) g
join lateral (select * from app.customers order by id offset ((g-1)%1500) limit 1) c on true
join lateral (select * from app.services where tenant_id=c.tenant_id order by id limit 1) s on true
on conflict (id) do nothing;

with pp as (select array_agg(id order by id) ids from app.customer_packages)
insert into app.package_movements (id,tenant_id,package_id,quantity,movement_type,reason,created_at)
select md5('package-movement:'||g)::uuid,p.tenant_id,p.id,1,(array['consume','consume','reverse','adjust'])[(g%4)+1],'Massa de dados','2026-08-01T12:00:00Z'
from generate_series(1,2500) g
cross join pp
join app.customer_packages p on p.id=pp.ids[((g-1)%cardinality(pp.ids))+1]
on conflict (id) do nothing;

-- Payments: 6,500 ------------------------------------------------------------
with cc as (select array_agg(id order by id) ids from app.customers)
insert into app.payments (id,tenant_id,customer_id,origin_type,origin_id,amount_cents,method,status,paid_at,created_at)
select md5('payment:'||g)::uuid,c.tenant_id,c.id,'appointment',a.id,10000+(g%20)*500,
 (array['cash','pix','debit_card','credit_card','transfer','internal_credit'])[(g%6)+1],(array['pending','partial','paid','refunded','canceled'])[(g%5)+1],
 case when g%5 in (2,3) then '2026-08-01T12:00:00Z'::timestamptz end,'2026-08-01T12:00:00Z'
from generate_series(1,6500) g
cross join cc
join app.customers c on c.id=cc.ids[((g-1)%cardinality(cc.ids))+1]
join lateral (select * from app.appointments where tenant_id=c.tenant_id order by id offset ((g-1)%100) limit 1) a on true
on conflict (id) do nothing;

-- Follow-ups: 2,000 ----------------------------------------------------------
with ss as (select array_agg(id order by id) ids from app.sessions)
insert into app.follow_ups (id,tenant_id,customer_id,session_id,suggested_at,reason,appointment_id,status,created_at,updated_at)
select md5('follow-up:'||g)::uuid,s.tenant_id,s.customer_id,s.id,'2026-09-01T12:00:00Z'::timestamptz+(g%60||' days')::interval,'Retorno recomendado',
 case when g%4=1 then s.appointment_id end,(array['pending','scheduled','completed','canceled'])[(g%4)+1],'2026-08-10T12:00:00Z','2026-08-10T12:00:00Z'
from generate_series(1,2000) g
cross join ss
join app.sessions s on s.id=ss.ids[((g-1)%cardinality(ss.ids))+1]
on conflict (id) do nothing;

-- Leads: 1,200 ---------------------------------------------------------------
insert into app.leads (id,tenant_id,full_name,phone,email,origin,privacy_consent_at,marketing_consent_at,status,created_at,updated_at)
select md5('lead:'||g)::uuid,(array['10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000004'::uuid])[(g%4)+1],
 'Lead '||lpad(g::text,4,'0'),'228'||lpad(g::text,8,'0'),'lead.'||g||'@example.test',
 (array['landing_contact','landing_newsletter','landing_service_interest','whatsapp','campaign','referral','manual'])[(g%7)+1],
 '2026-08-01T12:00:00Z',case when g%3=0 then '2026-08-01T12:00:00Z'::timestamptz end,
 (array['new','in_contact','awaiting_customer','appointment_created','converted','no_response','lost','duplicate'])[(g%8)+1],
 '2026-08-01T12:00:00Z','2026-08-10T12:00:00Z'
from generate_series(1,1200) g on conflict (id) do nothing;

-- Administration -------------------------------------------------------------
insert into app.tenant_users (id,tenant_id,full_name,email,profile,status,created_at,updated_at)
select md5('tenant-user:'||g)::uuid,(array['10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000004'::uuid])[(g%4)+1],
 'Usuário '||lpad(g::text,2,'0'),'usuario.'||g||'@example.test',(array['administrator','reception','professional'])[(g%3)+1],case when g%17=0 then 'inactive' else 'active' end,
 '2026-01-01T12:00:00Z','2026-08-10T12:00:00Z' from generate_series(1,45) g on conflict (id) do nothing;

insert into app.relationship_profile_configs (tenant_id,profile,minimum_completed_appointments,period_months,maximum_no_shows,inactive_after_days,manual_override_allowed,updated_at)
select t.id,p.profile,p.min_completed,p.period,p.no_shows,p.inactive_days,p.manual,'2026-08-10T12:00:00Z'
from app.tenants t cross join (values ('new',0,null,null,null,true),('returning',1,12,null,null,true),('loyal',3,6,1,null,true),('inactive',null,null,null,180,true),('frequent_no_show',null,6,2,null,false)) p(profile,min_completed,period,no_shows,inactive_days,manual)
where t.id::text like '10000000-0000-0000-0000-00000000000%' on conflict do nothing;

insert into app.discount_policies (id,tenant_id,name,profile,type,status,percentage,single_use,requires_approval,stackable,created_at,updated_at)
select md5('discount-policy:'||g)::uuid,(array['10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000004'::uuid])[(g%4)+1],
 'Política '||g,(array['new','returning','loyal','inactive','frequent_no_show'])[(g%5)+1],'percentage','active',5+(g%4)*5,false,g%7=0,false,'2026-01-01T12:00:00Z','2026-08-10T12:00:00Z'
from generate_series(1,30) g on conflict (id) do nothing;

-- Audit / Outbox / Idempotency ----------------------------------------------
insert into audit.events (id,tenant_id,actor_type,action,resource_type,resource_id,request_id,correlation_id,metadata,occurred_at)
select md5('audit:'||g)::uuid,(array['10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000004'::uuid])[(g%4)+1],
 'system',(array['appointment.created','deposit.confirmed','session.completed','payment.registered','customer.profile.changed'])[(g%5)+1],'demo',null,'seed-'||g,'corr-'||(g%1000),jsonb_build_object('seed',true),'2026-08-01T12:00:00Z'
from generate_series(1,30000) g on conflict (id) do nothing;

insert into app.outbox_events (id,tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload,status,attempts,created_at,published_at,last_error)
select md5('outbox:'||g)::uuid,(array['10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000004'::uuid])[(g%4)+1],
 'demo.event','demo',md5('aggregate:'||g)::uuid,'corr-'||(g%1000),jsonb_build_object('seed',true),(array['published','pending','failed','processing'])[(g%4)+1],g%3,'2026-08-01T12:00:00Z',
 case when g%4=0 then '2026-08-01T12:05:00Z'::timestamptz end,case when g%4=2 then 'simulated failure' end
from generate_series(1,12000) g on conflict (id) do nothing;

insert into app.idempotency_keys (id,tenant_id,idempotency_key,operation,request_hash,status,response,expires_at,created_at,updated_at)
select md5('idem:'||g)::uuid,(array['10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000004'::uuid])[(g%4)+1],
 'seed-'||g,(array['CreateAppointment','ConfirmDeposit','CompleteSession','RegisterPayment'])[(g%4)+1],md5('payload:'||g),(array['completed','processing','failed'])[(g%3)+1],
 case when g%3=0 then jsonb_build_object('ok',true) end,'2027-01-01T00:00:00Z','2026-08-01T12:00:00Z','2026-08-01T12:00:00Z'
from generate_series(1,8000) g on conflict (tenant_id,operation,idempotency_key) do nothing;

commit;

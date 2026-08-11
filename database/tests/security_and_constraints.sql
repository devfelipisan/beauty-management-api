begin;

insert into app.tenants (id,legal_name,display_name,document,timezone,status)
values
 ('00000000-0000-4000-8000-000000000001','Tenant A','Tenant A','tenant-a-test','UTC','active'),
 ('00000000-0000-4000-8000-000000000002','Tenant B','Tenant B','tenant-b-test','UTC','active');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='beauty_test_runtime') THEN
    CREATE ROLE beauty_test_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

grant usage on schema app, audit to beauty_test_runtime;
grant select, insert, update, delete on app.tenant_brandings, app.professionals, app.services, app.professional_services, app.customers, app.appointments, app.deposits, app.sessions, app.payments, app.leads, app.outbox_events, app.idempotency_keys to beauty_test_runtime;
grant select, insert, update, delete on audit.events to beauty_test_runtime;

set local role beauty_test_runtime;
select set_config('app.tenant_id','00000000-0000-4000-8000-000000000001',true);
select set_config('app.actor_id','10000000-0000-4000-8000-000000000001',true);

insert into app.customers (id,tenant_id,full_name,phone,status,relationship_profile)
values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Customer A','22000000001','active','new');

insert into app.professionals (id,tenant_id,display_name,active)
values ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Professional A',true);
insert into app.services (id,tenant_id,name,category,duration_minutes,price_cents,active,deposit_required,deposit_type,deposit_value,assessment_required)
values ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Service A','test',30,10000,true,false,'none',0,false);
insert into app.professional_services (tenant_id,professional_id,service_id)
values ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');

insert into app.leads (id,tenant_id,full_name,phone,email,service_id,origin,privacy_consent_at,marketing_consent_at,status)
values ('60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Lead A','22999990001','lead-a@example.com','30000000-0000-4000-8000-000000000001','landing_service_interest',now(),null,'new');

insert into app.appointments (id,tenant_id,customer_id,professional_id,service_id,starts_at,ends_at,status,base_price_cents,discount_cents,final_price_cents,deposit_cents,origin)
values ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-08-10 12:00:00+00','2026-08-10 12:30:00+00','confirmed',10000,0,10000,0,'manual');

DO $$
BEGIN
  BEGIN
    insert into app.appointments (id,tenant_id,customer_id,professional_id,service_id,starts_at,ends_at,status,base_price_cents,discount_cents,final_price_cents,deposit_cents,origin)
    values ('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-08-10 12:15:00+00','2026-08-10 12:45:00+00','confirmed',10000,0,10000,0,'manual');
    raise exception 'expected appointment exclusion violation';
  EXCEPTION WHEN exclusion_violation THEN
    null;
  END;
END $$;

insert into audit.events (id,tenant_id,actor_id,actor_type,action,resource_type,resource_id,request_id,correlation_id)
values ('50000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','user','test.created','customer','10000000-0000-4000-8000-000000000001','request-test','correlation-test');

DO $$
BEGIN
  BEGIN
    update audit.events set action='tampered' where id='50000000-0000-4000-8000-000000000001';
    raise exception 'expected append-only audit rejection';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    null;
  END;
END $$;

select set_config('app.tenant_id','00000000-0000-4000-8000-000000000002',true);

DO $$
DECLARE visible_count integer;
BEGIN
  select count(*) into visible_count from app.customers where id='10000000-0000-4000-8000-000000000001';
  if visible_count <> 0 then raise exception 'RLS leaked customer from another tenant'; end if;

  select count(*) into visible_count from app.leads where id='60000000-0000-4000-8000-000000000001';
  if visible_count <> 0 then raise exception 'RLS leaked lead from another tenant'; end if;

  select count(*) into visible_count from app.appointments where id='40000000-0000-4000-8000-000000000001';
  if visible_count <> 0 then raise exception 'RLS leaked appointment from another tenant'; end if;
END $$;

insert into app.customers (id,tenant_id,full_name,phone,status,relationship_profile)
values ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Customer B','22000000002','active','new');
insert into app.professionals (id,tenant_id,display_name,active)
values ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Professional B',true);
insert into app.services (id,tenant_id,name,category,duration_minutes,price_cents,active,deposit_required,deposit_type,deposit_value,assessment_required)
values ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Service B','test',30,10000,true,false,'none',0,false);

DO $$
BEGIN
  BEGIN
    insert into app.appointments (id,tenant_id,customer_id,professional_id,service_id,starts_at,ends_at,status,base_price_cents,discount_cents,final_price_cents,deposit_cents,origin)
    values ('40000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','2026-08-10 14:00:00+00','2026-08-10 14:30:00+00','confirmed',10000,0,10000,0,'manual');
    raise exception 'expected composite tenant foreign-key violation';
  EXCEPTION WHEN foreign_key_violation THEN
    null;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    insert into app.leads (id,tenant_id,full_name,phone,service_id,origin,privacy_consent_at,status)
    values ('60000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Cross Tenant Lead','22999990002','30000000-0000-4000-8000-000000000001','landing_service_interest',now(),'new');
    raise exception 'expected lead composite tenant foreign-key violation';
  EXCEPTION WHEN foreign_key_violation THEN
    null;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    insert into app.leads (id,tenant_id,full_name,origin,privacy_consent_at,status)
    values ('60000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','Lead Without Contact','landing_contact',now(),'new');
    raise exception 'expected lead contact constraint violation';
  EXCEPTION WHEN check_violation THEN
    null;
  END;
END $$;

reset role;
rollback;

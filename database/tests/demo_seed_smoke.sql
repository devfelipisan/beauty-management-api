do $$
declare
  expected_appointment_statuses text[] := array[
    'awaiting_deposit','awaiting_confirmation','confirmed','checked_in','in_progress',
    'completed','rescheduled','canceled','no_show','expired'
  ];
  expected_deposit_statuses text[] := array[
    'not_required','awaiting_payment','proof_submitted','under_review','confirmed',
    'rejected','expired','refunded','retained','credit'
  ];
  expected_customer_profiles text[] := array['new','returning','loyal','inactive','frequent_no_show'];
  expected_payment_statuses text[] := array['pending','partial','paid','refunded','canceled'];
  missing text;
begin
  -- Core tenancy / public identity -------------------------------------------
  if (select count(*) from app.tenants where id in (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000004'
    )) <> 4 then
    raise exception 'demo seed must contain four reference tenants';
  end if;

  if not exists (select 1 from app.tenants where status = 'trial')
     or not exists (select 1 from app.tenants where status = 'active')
     or not exists (select 1 from app.tenants where status = 'suspended') then
    raise exception 'demo seed must cover active, trial and suspended tenants';
  end if;

  if not exists (select 1 from app.tenants where public_slug = 'clinica-bella')
     or not exists (select 1 from app.tenants where public_slug = 'essenza-spa')
     or not exists (select 1 from app.tenants where public_slug = 'studio-aurora') then
    raise exception 'demo seed must expose canonical public tenant slugs';
  end if;

  if (select count(*) from app.landing_pages where tenant_id in (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000004'
    )) < 4 then
    raise exception 'demo seed must configure a landing page for each reference tenant';
  end if;

  if not exists (select 1 from app.landing_pages where status = 'published')
     or not exists (select 1 from app.landing_pages where status = 'draft')
     or not exists (select 1 from app.landing_pages where status = 'hidden') then
    raise exception 'demo seed must cover published, draft and hidden landing page states';
  end if;

  -- Identity / authorization -------------------------------------------------
  if (select count(*) from identity.users) < 45 then
    raise exception 'demo seed must contain at least 45 users';
  end if;

  if not exists (
    select 1 from identity.users u
    join identity.tenant_memberships m on m.user_id = u.id
    group by u.id
    having count(distinct m.tenant_id) > 1
  ) then
    raise exception 'demo seed must cover a multi-tenant authenticated user';
  end if;

  if not exists (
    select 1
    from identity.membership_roles mr
    join identity.roles r on r.id = mr.role_id
    where r.code = 'professional'
  ) or not exists (
    select 1
    from identity.membership_roles mr
    join identity.roles r on r.id = mr.role_id
    where r.code = 'reception'
  ) or not exists (
    select 1
    from identity.membership_roles mr
    join identity.roles r on r.id = mr.role_id
    where r.code = 'tenant_admin'
  ) then
    raise exception 'demo seed must cover professional, reception and tenant-admin memberships';
  end if;

  -- Catalog / customers ------------------------------------------------------
  if (select count(*) from app.professionals) < 24 then
    raise exception 'demo seed must contain at least 24 professionals';
  end if;

  if (select count(*) from app.services) < 45 then
    raise exception 'demo seed must contain at least 45 services';
  end if;

  if not exists (
    select 1 from app.services s
    where s.category = 'tatuagem'
  ) or not exists (
    select 1 from app.services s
    where s.category in ('laser','facial','massagem')
  ) then
    raise exception 'demo seed must cover tattoo and aesthetics/service-session domains';
  end if;

  if (select count(*) from app.equipment) < 18 then
    raise exception 'demo seed must contain at least 18 equipment records';
  end if;

  if not exists (select 1 from app.equipment where status = 'available')
     or not exists (select 1 from app.equipment where status = 'maintenance')
     or not exists (select 1 from app.equipment where status = 'blocked')
     or not exists (select 1 from app.equipment where status = 'inactive') then
    raise exception 'demo seed must cover all equipment availability states';
  end if;

  if (select count(*) from app.customers) < 1500 then
    raise exception 'demo seed must contain at least 1,500 customers';
  end if;

  foreach missing in array expected_customer_profiles loop
    if not exists (select 1 from app.customers where relationship_profile = missing) then
      raise exception 'demo seed is missing customer relationship profile %', missing;
    end if;
  end loop;

  -- Appointments / professional agenda --------------------------------------
  if (select count(*) from app.appointments) < 8000 then
    raise exception 'demo seed must contain at least 8,000 appointments';
  end if;

  foreach missing in array expected_appointment_statuses loop
    if not exists (select 1 from app.appointments where status = missing) then
      raise exception 'demo seed is missing appointment status %', missing;
    end if;
  end loop;

  -- A professional must have a meaningful personal agenda while the same
  -- tenant contains appointments for other professionals. This is the data
  -- prerequisite for /me/agenda authorization tests.
  if not exists (
    select 1
    from app.appointments a
    group by a.tenant_id, a.professional_id
    having count(*) >= 100
       and exists (
         select 1
         from app.appointments other
         where other.tenant_id = a.tenant_id
           and other.professional_id <> a.professional_id
       )
  ) then
    raise exception 'demo seed must support professional-scoped agenda isolation tests';
  end if;

  if exists (
    select 1
    from app.appointments a
    join app.customers c on c.id = a.customer_id
    where c.tenant_id <> a.tenant_id
  ) or exists (
    select 1
    from app.appointments a
    join app.professionals p on p.id = a.professional_id
    where p.tenant_id <> a.tenant_id
  ) or exists (
    select 1
    from app.appointments a
    join app.services s on s.id = a.service_id
    where s.tenant_id <> a.tenant_id
  ) then
    raise exception 'demo seed contains cross-tenant appointment references';
  end if;

  -- Deposit lifecycle --------------------------------------------------------
  if (select count(*) from app.deposits) < 5000 then
    raise exception 'demo seed must contain at least 5,000 deposits';
  end if;

  foreach missing in array expected_deposit_statuses loop
    if not exists (select 1 from app.deposits where status = missing) then
      raise exception 'demo seed is missing deposit status %', missing;
    end if;
  end loop;

  -- Assessment / session / technical history --------------------------------
  if (select count(*) from app.assessments) < 950 then
    raise exception 'demo seed must contain at least 950 assessments';
  end if;

  if not exists (select 1 from app.assessments where result = 'fit')
     or not exists (select 1 from app.assessments where result = 'fit_with_restrictions')
     or not exists (select 1 from app.assessments where result = 'not_fit') then
    raise exception 'demo seed must cover all assessment outcomes';
  end if;

  if (select count(*) from app.sessions) < 4500 then
    raise exception 'demo seed must contain at least 4,500 sessions';
  end if;

  if not exists (select 1 from app.sessions where status = 'in_progress')
     or not exists (select 1 from app.sessions where status = 'completed') then
    raise exception 'demo seed must cover in-progress and completed sessions';
  end if;

  if (select count(*) from app.technical_records) < 12000 then
    raise exception 'demo seed must contain at least 12,000 technical records';
  end if;

  if not exists (select 1 from app.technical_records where equipment_id is not null)
     or not exists (select 1 from app.technical_records where power is not null)
     or not exists (select 1 from app.technical_records where notes like '%Ajuste de parâmetro%') then
    raise exception 'demo seed must cover equipment, power history and parameter-adjustment scenarios';
  end if;

  -- Packages / payments / follow-ups ----------------------------------------
  if (select count(*) from app.customer_packages) < 700 then
    raise exception 'demo seed must contain at least 700 customer packages';
  end if;

  if not exists (select 1 from app.customer_packages where status = 'active')
     or not exists (select 1 from app.customer_packages where status = 'exhausted')
     or not exists (select 1 from app.customer_packages where status = 'expired')
     or not exists (select 1 from app.customer_packages where status = 'canceled') then
    raise exception 'demo seed must cover all package lifecycle states';
  end if;

  if (select count(*) from app.package_movements) < 2000 then
    raise exception 'demo seed must contain at least 2,000 package movements';
  end if;

  if not exists (select 1 from app.package_movements where movement_type = 'consume')
     or not exists (select 1 from app.package_movements where movement_type = 'reverse')
     or not exists (select 1 from app.package_movements where movement_type = 'adjust') then
    raise exception 'demo seed must cover consume, reverse and adjust package movements';
  end if;

  if (select count(*) from app.payments) < 6500 then
    raise exception 'demo seed must contain at least 6,500 payments';
  end if;

  foreach missing in array expected_payment_statuses loop
    if not exists (select 1 from app.payments where status = missing) then
      raise exception 'demo seed is missing payment status %', missing;
    end if;
  end loop;

  if (select count(*) from app.follow_ups) < 2000 then
    raise exception 'demo seed must contain at least 2,000 follow-ups';
  end if;

  if not exists (select 1 from app.follow_ups where status = 'pending')
     or not exists (select 1 from app.follow_ups where status = 'scheduled')
     or not exists (select 1 from app.follow_ups where status = 'completed')
     or not exists (select 1 from app.follow_ups where status = 'canceled') then
    raise exception 'demo seed must cover follow-up lifecycle states';
  end if;

  -- Leads --------------------------------------------------------------------
  if (select count(*) from app.leads) < 1200 then
    raise exception 'demo seed must contain at least 1,200 leads';
  end if;

  if not exists (select 1 from app.leads where origin = 'landing_newsletter' and customer_id is null and appointment_id is null) then
    raise exception 'demo seed must contain institutional newsletter leads without automatic customer/appointment conversion';
  end if;

  if not exists (select 1 from app.leads where status = 'new')
     or not exists (select 1 from app.leads where status = 'in_contact')
     or not exists (select 1 from app.leads where status = 'converted')
     or not exists (select 1 from app.leads where status = 'appointment_created')
     or not exists (select 1 from app.leads where status = 'duplicate') then
    raise exception 'demo seed must cover the main lead lifecycle states';
  end if;

  -- Transactional infrastructure --------------------------------------------
  if (select count(*) from audit.events) < 30000 then
    raise exception 'demo seed must contain at least 30,000 audit events';
  end if;

  if (select count(*) from app.outbox_events) < 12000 then
    raise exception 'demo seed must contain at least 12,000 outbox events';
  end if;

  if not exists (select 1 from app.outbox_events where status = 'published')
     or not exists (select 1 from app.outbox_events where status = 'pending')
     or not exists (select 1 from app.outbox_events where status = 'failed')
     or not exists (select 1 from app.outbox_events where status = 'processing') then
    raise exception 'demo seed must cover all outbox processing states';
  end if;

  if (select count(*) from app.idempotency_keys) < 8000 then
    raise exception 'demo seed must contain at least 8,000 idempotency records';
  end if;

  if not exists (select 1 from app.idempotency_keys where status = 'completed')
     or not exists (select 1 from app.idempotency_keys where status = 'processing')
     or not exists (select 1 from app.idempotency_keys where status = 'failed') then
    raise exception 'demo seed must cover completed, processing and failed idempotency states';
  end if;
end $$;

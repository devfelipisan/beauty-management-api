do $$
begin
  if (select count(*) from app.tenants where id in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')) <> 2 then
    raise exception 'demo seed must contain two tenants';
  end if;

  if not exists (
    select 1 from identity.users u
    join identity.tenant_memberships m on m.user_id = u.id
    group by u.id
    having count(distinct m.tenant_id) > 1
  ) then
    raise exception 'demo seed must cover a multi-tenant authenticated user';
  end if;

  if not exists (select 1 from app.tenants where public_slug = 'clinica-bella') then
    raise exception 'demo seed must expose canonical public tenant slug';
  end if;

  if (select count(distinct status) from app.appointments where tenant_id = '10000000-0000-0000-0000-000000000001') < 5 then
    raise exception 'demo seed must cover multiple appointment lifecycle statuses';
  end if;

  if not exists (select 1 from app.deposits where status = 'awaiting_payment')
     or not exists (select 1 from app.deposits where status = 'confirmed')
     or not exists (select 1 from app.deposits where status = 'retained') then
    raise exception 'demo seed must cover deposit lifecycle examples';
  end if;

  if not exists (select 1 from app.sessions where status = 'in_progress')
     or not exists (select 1 from app.sessions where status = 'completed') then
    raise exception 'demo seed must cover in-progress and completed sessions';
  end if;

  if not exists (select 1 from app.technical_records where equipment_id is not null) then
    raise exception 'demo seed must cover technical session record with equipment';
  end if;

  if not exists (select 1 from app.assessments where result = 'fit')
     or not exists (select 1 from app.assessments where result = 'fit_with_restrictions') then
    raise exception 'demo seed must cover assessment outcomes';
  end if;

  if not exists (select 1 from app.customer_packages where status = 'active')
     or not exists (select 1 from app.customer_packages where status = 'exhausted')
     or not exists (select 1 from app.package_movements where movement_type = 'consume') then
    raise exception 'demo seed must cover package balance and consumption';
  end if;

  if not exists (select 1 from app.payments where status = 'paid')
     or not exists (select 1 from app.payments where status = 'pending') then
    raise exception 'demo seed must cover payment states';
  end if;

  if not exists (select 1 from app.follow_ups where status = 'pending')
     or not exists (select 1 from app.follow_ups where status = 'scheduled') then
    raise exception 'demo seed must cover follow-up states';
  end if;

  if not exists (select 1 from app.leads where status = 'new')
     or not exists (select 1 from app.leads where status = 'in_contact')
     or not exists (select 1 from app.leads where status = 'converted') then
    raise exception 'demo seed must cover lead lifecycle';
  end if;

  if not exists (select 1 from app.equipment where status = 'available')
     or not exists (select 1 from app.equipment where status = 'maintenance') then
    raise exception 'demo seed must cover equipment availability states';
  end if;

  if not exists (select 1 from app.landing_pages where status = 'published')
     or not exists (select 1 from app.landing_pages where status = 'draft') then
    raise exception 'demo seed must cover landing page publication states';
  end if;
end $$;

begin;

create or replace function identity.ensure_default_tenant_roles(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = identity, app, pg_temp
as $$
declare
  tenant_admin_role uuid;
  reception_role uuid;
  professional_role uuid;
begin
  if not exists (select 1 from app.tenants where id = p_tenant_id) then
    raise exception 'tenant % does not exist', p_tenant_id using errcode = '23503';
  end if;

  insert into identity.roles (tenant_id, code, name, system_role)
  values (p_tenant_id, 'tenant_admin', 'Tenant administrator', true)
  on conflict (tenant_id, code) do update set name = excluded.name
  returning id into tenant_admin_role;

  insert into identity.roles (tenant_id, code, name, system_role)
  values (p_tenant_id, 'reception', 'Reception', true)
  on conflict (tenant_id, code) do update set name = excluded.name
  returning id into reception_role;

  insert into identity.roles (tenant_id, code, name, system_role)
  values (p_tenant_id, 'professional', 'Professional', true)
  on conflict (tenant_id, code) do update set name = excluded.name
  returning id into professional_role;

  insert into identity.role_permissions (role_id, permission_code)
  select tenant_admin_role, code from identity.permissions
  where code <> 'platform:tenant:create'
  on conflict do nothing;

  insert into identity.role_permissions (role_id, permission_code)
  select reception_role, code from identity.permissions
  where code in (
    'professional:read','service:read','customer:read','customer:create','customer:update',
    'appointment:read','appointment:create','appointment:reschedule','appointment:cancel','appointment:check-in',
    'deposit:confirm','payment:read','payment:create'
  )
  on conflict do nothing;

  insert into identity.role_permissions (role_id, permission_code)
  select professional_role, code from identity.permissions
  where code in ('customer:read','appointment:read','session:start','session:complete')
  on conflict do nothing;
end;
$$;

create or replace function identity.initialize_tenant_roles_trigger()
returns trigger
language plpgsql
security definer
set search_path = identity, app, pg_temp
as $$
begin
  perform identity.ensure_default_tenant_roles(new.id);
  return new;
end;
$$;

drop trigger if exists tenants_initialize_default_roles on app.tenants;
create trigger tenants_initialize_default_roles
after insert on app.tenants
for each row execute function identity.initialize_tenant_roles_trigger();

select identity.ensure_default_tenant_roles(id) from app.tenants;

commit;

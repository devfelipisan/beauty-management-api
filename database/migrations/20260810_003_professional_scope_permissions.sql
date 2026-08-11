begin;

insert into identity.permissions (code, description) values
  ('appointment:read-own', 'Read appointments assigned to the authenticated professional'),
  ('customer:read-linked', 'Read customers linked to appointments assigned to the authenticated professional')
on conflict (code) do update set description = excluded.description;

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

  delete from identity.role_permissions
  where role_id = professional_role
    and permission_code in ('appointment:read','customer:read','package:read');

  insert into identity.role_permissions (role_id, permission_code)
  select professional_role, code from identity.permissions
  where code in (
    'appointment:read-own','customer:read-linked',
    'assessment:read','assessment:create','equipment:read',
    'session:start','session:complete','technical-record:read','technical-record:create',
    'follow-up:read','follow-up:create'
  )
  on conflict do nothing;
end;
$$;

select identity.ensure_default_tenant_roles(id) from app.tenants;

commit;

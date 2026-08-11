begin;

create index if not exists roles_tenant_code_workspace_idx
  on identity.roles (tenant_id, code)
  where code in ('tenant_admin', 'reception', 'professional');

create index if not exists professionals_tenant_active_display_idx
  on app.professionals (tenant_id, display_name, id)
  where active = true;

create index if not exists tenants_operational_display_idx
  on app.tenants (status, display_name, id)
  where status in ('active', 'trial');

commit;

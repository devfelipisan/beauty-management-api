begin;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beauty_runtime') THEN
    CREATE ROLE beauty_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

grant usage on schema app, identity, audit to beauty_runtime;

grant select, insert on app.tenants to beauty_runtime;
grant select, insert, update on app.tenant_brandings to beauty_runtime;
grant select, insert, update on app.professionals, app.services, app.customers, app.appointments, app.deposits, app.sessions, app.payments to beauty_runtime;
grant select, insert, update, delete on app.professional_services to beauty_runtime;
grant select, insert, update on app.idempotency_keys to beauty_runtime;
grant select, insert, update on app.outbox_events to beauty_runtime;

grant select, insert on audit.events to beauty_runtime;

grant select on identity.users, identity.tenant_memberships, identity.permissions, identity.roles, identity.role_permissions, identity.membership_roles, identity.platform_user_roles to beauty_runtime;
grant execute on function identity.ensure_default_tenant_roles(uuid) to beauty_runtime;

-- A deployment-specific LOGIN role must be created outside source control and
-- granted beauty_runtime. Never place database passwords in migrations.

commit;

# PostgreSQL adapter migration

The Business API owns PostgreSQL persistence and tenant authorization. Web/BFF never instantiate database adapters and never become the authority for tenant selection.

## Current production composition

PostgreSQL/Supabase is the production persistence adapter. The production composition root does not select the in-memory runtime.

```text
Request
  -> Supabase Auth
  -> database-backed tenant/membership resolution
  -> BusinessApi / AdministrationApi
  -> Application Use Cases
  -> UnitOfWork / repository ports
  -> PostgreSQL repositories / PostgresUnitOfWork
  -> SqlClient
  -> postgres.js
  -> Supavisor transaction pooler
  -> PostgreSQL
```

Implemented persistence adapters include:

- transactional repositories through `PostgresUnitOfWork`;
- leads and access control;
- equipment and packages;
- assessments, technical records and follow-ups;
- tenant settings and landing page;
- tenant users and commercial policies;
- public tenant lookup by canonical `public_slug`.

## Tenant context boundary

For authenticated requests, `x-tenant-id` is only an optional selector. `PostgresAccessControlRepository` resolves the canonical context from:

```text
identity.users
  -> identity.tenant_memberships
  -> app.tenants
  -> identity.membership_roles
  -> identity.roles
  -> identity.role_permissions
  -> identity.professional_memberships (when applicable)
```

Only this resolved context is allowed to populate `ExecutionContext.tenantId`. `PostgresUnitOfWork` then configures `app.tenant_id` and `app.actor_id` inside the database transaction, where RLS provides a second tenant-isolation boundary.

Public routes do not use membership context. They resolve `app.tenants.public_slug` directly and expose only public operational tenants.

The in-memory classes remain only as empty test doubles for isolated unit tests. They contain no demo/volume dataset and are not imported by the production composition root.

Migration and demo data live under `database/migrations` and `database/seeds`. Database security contracts live under `database/tests` and are executable with `npm run db:security:check`.

No use case or domain object depends directly on PostgreSQL, postgres.js or a Supabase database SDK.

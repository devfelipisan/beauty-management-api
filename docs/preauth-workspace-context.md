# Pre-auth workspace context

The current MVP intentionally runs with `AUTHENTICATION_ENABLED=false`. Multi-tenancy and operational role scope are still resolved server-side from PostgreSQL; no tenant catalog, fake actor or role identity is supplied through environment variables.

## Bootstrap

`GET /v1/bootstrap/workspace` lists only `active`/`trial` tenants and derives the selectable operational roles from `identity.roles`. Active professionals are included only inside the `professional` role option.

`POST /v1/bootstrap/context` validates a concrete selection before it is used by tenant-scoped operations.

Both endpoints are disabled when authentication is enabled.

## Selector headers

Tenant-scoped requests in pre-auth mode use:

- `x-tenant-id`: persisted `app.tenants.id` UUID;
- `x-workspace-role`: `administrator`, `reception` or `professional`;
- `x-professional-id`: required for the professional role.

These headers are selector hints, not authenticated identity. `WorkspaceContextResolver` validates them against PostgreSQL before creating the `ExecutionContext`.

No synthetic `actorId` or membership is created. Auditing therefore remains system/pre-auth until real authentication supplies an actor.

## Operational policy

The pre-auth role policy reuses the system role permission catalog to keep development behavior aligned with eventual RBAC. Professional reads map to own/linked permissions and require a valid professional belonging to the tenant.

`GET /v1/appointments` returns only appointments owned by the resolved professional when a professional workspace is active. `GET /v1/customers` returns only customers linked through those appointments.

The role selector is useful for exercising the MVP experiences, but it is not proof that a human user is entitled to the role. Real user authorization remains the responsibility of the authenticated membership/RBAC flow when enabled.

## RLS

The resolved tenant ID is propagated into the normal `ExecutionContext` and `PostgresUnitOfWork`, which continues to set the PostgreSQL tenant context used by RLS. Pre-auth mode therefore does not weaken tenant isolation.

## Future authentication

When `AUTHENTICATION_ENABLED=true`, the bootstrap endpoints stop being available and the existing authenticated flow resolves:

`Supabase Auth -> identity.users -> tenant_memberships -> membership_roles -> role_permissions -> professional_memberships`.

The application/use-case layer continues receiving the same tenant/professional execution context; only the source of identity and authorization changes.

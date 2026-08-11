# Multi-tenant execution context

## Invariant

The effective tenant is always resolved by `beauty-management-api` from PostgreSQL. A selector provided by Frontend/BFF is never used directly as authority.

The current MVP has two execution modes controlled by:

```env
AUTHENTICATION_ENABLED=false
```

## Pre-authentication mode (current MVP)

With authentication disabled, tenant-scoped routes do not require a Bearer token. The API still resolves and validates the tenant in the database:

```text
request
  -> optional x-tenant-id selector
  -> app.tenants lookup
  -> UUID / existence / operational status validation
  -> resolved tenantId
  -> ExecutionContext (without actorId/membershipId)
  -> PostgresUnitOfWork
  -> SET app.tenant_id
  -> RLS
```

Rules:

1. `x-tenant-id` is only a selector hint.
2. A provided selector must be a UUID and must exist in `app.tenants`.
3. `active` and `trial` tenants are operational.
4. `suspended` and `closed` tenants are rejected.
5. With exactly one operational tenant, the API may resolve it automatically.
6. With multiple operational tenants and no selector, the API returns `TENANT_SELECTION_REQUIRED`; it never chooses an arbitrary tenant.
7. No fake user, membership, role or `actorId` is created.
8. Audit events generated without a human identity use actor type `system`.
9. `/v1/me/*` and platform-scoped operations are unavailable until authentication is enabled.
10. Tenant predicates, composite FKs and PostgreSQL RLS remain enabled.

## Authenticated mode (future login)

When:

```env
AUTHENTICATION_ENABLED=true
```

resolution becomes:

```text
Authorization: Bearer <token>
        |
        v
Supabase Auth -> auth subject
        |
        v
identity.users
        |
        v
identity.tenant_memberships
        |
        +-> app.tenants
        +-> membership roles / permissions
        +-> identity.professional_memberships
        |
        v
Resolved TenantAccess
        |
        v
ExecutionContext
        |
        v
PostgresUnitOfWork -> app.tenant_id / app.actor_id -> RLS
```

Authenticated selection rules:

1. `x-tenant-id` remains only a selector hint.
2. The selector must match a persisted membership for the authenticated user.
3. With one active membership whose tenant is `active` or `trial`, the API can resolve it automatically.
4. With multiple operational memberships, the API returns `TENANT_SELECTION_REQUIRED` when none is selected.
5. The API never uses `LIMIT 1` or another arbitrary rule to choose a tenant.
6. Inactive/suspended memberships cannot execute tenant operations.
7. Suspended/closed tenants remain discoverable through `/v1/me/tenants` with `selectable: false`.
8. Cross-tenant resource IDs remain protected by tenant predicates, composite FKs and RLS.

## Identity context endpoints

These endpoints require `AUTHENTICATION_ENABLED=true`:

- `GET /v1/me/tenants`;
- `GET /v1/me/context`;
- `GET /v1/me/appointments`;
- `GET /v1/me/customers`.

While authentication is disabled they return `AUTHENTICATION_NOT_ENABLED` instead of manufacturing an identity.

## Professional scope

When authenticated, the default `professional` role does not receive the tenant-wide permissions `appointment:read`, `customer:read` or `package:read`.

It receives scoped permissions such as:

- `appointment:read-own`;
- `customer:read-linked`;
- assessment/session/technical-record/follow-up permissions additionally checked against the resolved `professionalId`.

Session start/completion, assessment creation, technical records and follow-ups reject resources assigned to another professional even when the resource belongs to the same tenant.

Without authentication the backend cannot safely infer the semantic meaning of "meu profissional"; therefore own-scope `/v1/me/*` remains blocked until login is available.

## Public tenant context

Public pages do not use membership resolution:

```text
/:slug
  -> normalize slug
  -> app.tenants.public_slug
  -> tenant status active/trial
  -> public TenantContext
```

The public slug is globally unique and belongs to the tenant. Landing-page data is tenant-owned content and does not become a second tenant identity.

## Error contract

| Code | HTTP | Meaning |
| --- | ---: | --- |
| `AUTHENTICATION_NOT_ENABLED` | 409 | route requires user identity but login is intentionally disabled |
| `AUTHENTICATION_REQUIRED` | 401 | authentication is enabled but no valid token was supplied |
| `TENANT_SELECTION_INVALID` | 400 | selector is not a UUID |
| `TENANT_SELECTION_REQUIRED` | 400 | multiple operational tenants exist / user has multiple operational memberships |
| `TENANT_MEMBERSHIP_REQUIRED` | 403 | authenticated selected membership does not exist |
| `TENANT_MEMBERSHIP_INACTIVE` | 403 | membership is not active |
| `TENANT_SUSPENDED` | 403 | tenant is suspended |
| `TENANT_CLOSED` | 403 | tenant is closed |
| `PERMISSION_REQUIRED` | 403 | authenticated membership lacks requested permission |
| `PROFESSIONAL_CONTEXT_REQUIRED` | 403 | professional route has no linked professional profile |

Infrastructure failures keep generic public responses, while internal logs include `requestId`, route/operation, SQLSTATE/error code and constraint when available.

## Verification

```bash
npm run check
npm run db:migrate
npm run db:seed
npm run db:seed:check
npm run db:security:check
```

`db:security:check` validates RLS isolation, cross-tenant composite constraints, appointment overlap constraints and append-only audit behavior.

# Multi-tenant execution context

## Invariant

The effective tenant is always resolved by `beauty-management-api` from persisted identity and membership data. Frontend/BFF may request a tenant selection, but that value is never trusted as authorization context.

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

## Authenticated selection rules

1. `x-tenant-id` is optional and is interpreted only as a selector hint.
2. A selector must be a UUID and must match a persisted membership for the authenticated user.
3. With one active membership whose tenant is `active` or `trial`, the API can resolve that tenant automatically.
4. With multiple operational memberships, the request must select one and the API returns `TENANT_SELECTION_REQUIRED` when none is selected.
5. The API never uses `LIMIT 1` or another arbitrary rule to choose a tenant.
6. Inactive/suspended memberships cannot execute tenant operations.
7. Suspended/closed tenants remain discoverable through `/v1/me/tenants` but are returned with `selectable: false` and cannot be used for normal operations.
8. Cross-tenant resource IDs remain protected by tenant predicates, composite FKs and RLS.

## Context endpoints

### `GET /v1/me/tenants`

Lists persisted memberships for the authenticated identity. It is intended to feed a Tenant Switcher without making the frontend an authorization authority.

Example shape:

```json
{
  "items": [
    {
      "id": "10000000-0000-0000-0000-000000000001",
      "displayName": "Clínica Bella",
      "publicSlug": "clinica-bella",
      "status": "active",
      "selectable": true,
      "membership": {
        "id": "22000000-0000-0000-0000-000000000001",
        "status": "active",
        "roles": ["tenant_admin"]
      }
    }
  ]
}
```

### `GET /v1/me/context`

Returns the resolved tenant for the current request. With multiple active tenants, the caller must send a valid `x-tenant-id` selector.

### `GET /v1/me/appointments`

Professional-only own-scope agenda. The professional identity is resolved from `identity.professional_memberships`; the client never supplies the authoritative `professionalId`.

### `GET /v1/me/customers`

Returns only customers linked to appointments assigned to the authenticated professional.

## Professional scope

The default `professional` role does not receive the tenant-wide permissions `appointment:read`, `customer:read` or `package:read`.

It receives scoped permissions such as:

- `appointment:read-own`;
- `customer:read-linked`;
- assessment/session/technical-record/follow-up permissions that are additionally checked against the resolved `professionalId`.

Session start/completion, assessment creation, technical records and follow-ups reject resources assigned to another professional even when the resource belongs to the same tenant.

An account may hold another role in addition to `professional`. Tenant-wide administrative screens still require their corresponding global permissions. `Minha agenda` remains semantically own-scope.

## Public tenant context

Public pages do not use authenticated membership resolution:

```text
/:slug
  -> normalize slug
  -> app.tenants.public_slug
  -> tenant status active/trial
  -> public TenantContext
```

The public slug is globally unique and belongs to the tenant. Landing-page data is tenant-owned content and does not become a second tenant identity.

## Error contract

Expected tenant errors are mapped explicitly rather than becoming `INTERNAL_ERROR`:

| Code | HTTP | Meaning |
| --- | ---: | --- |
| `TENANT_SELECTION_INVALID` | 400 | selector is not a UUID |
| `TENANT_SELECTION_REQUIRED` | 400 | user has multiple operational tenants |
| `TENANT_MEMBERSHIP_REQUIRED` | 403 | selected/automatic membership does not exist |
| `TENANT_MEMBERSHIP_INACTIVE` | 403 | membership is not active |
| `TENANT_SUSPENDED` | 403 | tenant is suspended |
| `TENANT_CLOSED` | 403 | tenant is closed |
| `PERMISSION_REQUIRED` | 403 | membership lacks requested permission |
| `PROFESSIONAL_CONTEXT_REQUIRED` | 403 | professional route has no linked professional profile |

Infrastructure failures keep generic public responses, while internal logs include `requestId`, route/operation, SQLSTATE/error code and constraint when available.

## Database migrations

The multi-tenant context implementation adds:

- `20260810_002_tenant_context.sql`: `identity.professional_memberships`;
- `20260810_003_professional_scope_permissions.sql`: own/linked RBAC permissions;
- `20260810_004_runtime_tenant_context_grants.sql`: runtime grants for the professional membership mapping.

The deterministic seed links the demo professional identity through `database/seeds/0003_professional_memberships.sql`.

## Verification

```bash
npm run check
npm run db:migrate
npm run db:seed
npm run db:seed:check
npm run db:security:check
```

`db:security:check` validates RLS isolation, cross-tenant composite constraints, appointment overlap constraints and append-only audit behavior.

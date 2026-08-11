# Supabase PostgreSQL runtime

`beauty-management-api` uses PostgreSQL/Supabase as the production persistence adapter. In-memory repositories are empty test doubles only; demo/business data is stored by PostgreSQL seeds and is never loaded into Worker memory.

## Environment variables

| Variable | Purpose | Secret |
| --- | --- | --- |
| `SPIdBD` | Supabase project reference/id | no |
| `SBNameDB` | PostgreSQL database name, normally `postgres` | no |
| `DATABASE_URL` | Preferred exact Transaction Pooler URI copied from Supabase Connect | **yes** |
| `SBDatabaseHost` | Exact Transaction Pooler host when decomposed config is used | no |
| `SBDatabasePort` | Pooler port, normally `6543` | no |
| `SBDatabaseUser` | Pooler user, normally `postgres.<project-ref>` | no |
| `SPRegionDB` | Legacy host-derivation fallback only | no |
| `SPPasswordDB` | PostgreSQL database password | **yes** |
| `ApiKeySupaBase` | Supabase publishable/anon API key used by Auth token verification | **yes** |

`ApiKeySupaBase` is not a PostgreSQL password and cannot be used in the PostgreSQL connection string.

The runtime no longer uses `API_DEV_AUTH_ID`, `API_AUTH_MODE`, `API_DEV_AUTH_SUBJECT` or `API_DEV_TENANT_ID`.

## Connections

For Worker/serverless traffic, prefer the exact **Transaction Pooler** URI copied from Supabase Connect:

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres?sslmode=require
```

Do not derive the pooler hostname from region when the exact endpoint is available. `SBDatabaseHost`, `SBDatabasePort` and `SBDatabaseUser` are supported when the URI is supplied as decomposed values.

Migrations default to the direct PostgreSQL endpoint:

```text
postgresql://postgres:<SPPasswordDB>@db.<SPIdBD>.supabase.co:5432/<SBNameDB>?sslmode=require
```

`MIGRATION_DATABASE_URL`, `SBMigrationHost`, `SBMigrationPort` and `SBMigrationUser` can override that endpoint. `SPDatabaseConnectionMode=runtime` makes the database runner use the transaction-pooler configuration when direct connectivity is unavailable.

## Tenant resolution

Authenticated requests do **not** trust a tenant from the frontend/BFF. The optional `x-tenant-id` header is only a selector hint.

```text
Bearer token
  -> Supabase Auth user id
  -> identity.users.auth_subject
  -> identity.tenant_memberships
  -> app.tenants
  -> roles / permissions
  -> resolved TenantAccess
  -> ExecutionContext.tenantId
  -> PostgresUnitOfWork
  -> set_config('app.tenant_id', ...)
  -> RLS
```

Rules:

- one active operational membership: tenant may be resolved automatically;
- multiple active operational memberships: `TENANT_SELECTION_REQUIRED` until one is selected;
- invalid selector: `TENANT_SELECTION_INVALID`;
- membership missing/inactive: access denied;
- suspended/closed tenant: visible in `/v1/me/tenants`, but not selectable for normal operations;
- the resolved database tenant is the only value propagated into `ExecutionContext` and RLS.

Professional memberships are mapped through `identity.professional_memberships`. The `professionalId` resolved by the backend scopes `GET /v1/me/appointments`, linked clients, assessments, technical records, follow-ups and session mutations.

Public requests are separate from authenticated membership resolution. `/v1/public/:slug/*` resolves `app.tenants.public_slug` directly in PostgreSQL and exposes only operational public tenants (`active`/`trial`).

## Local setup

Create `.dev.vars` from `.dev.vars.example` and populate credentials without committing them.

```bash
npm install
npm run db:check
npm run db:migrate
npm run db:seed
npm run db:seed:check
npm run db:security:check
```

Or:

```bash
npm run db:setup
```

`db:setup` executes migrations, deterministic seeds, seed contracts and RLS/constraint security contracts. Migrations are tracked in `public.schema_migrations`.

## Cloudflare configuration

Keep connection URIs, database passwords and API credentials as Worker secrets. At minimum:

```bash
npx wrangler secret put SPPasswordDB
npx wrangler secret put ApiKeySupaBase
```

If `DATABASE_URL` is used, configure it as a secret as well. `SPIdBD`, `SBNameDB` and non-sensitive decomposed endpoint metadata can be regular Worker variables.

## Health

`GET /health` and `GET /v1/health` are liveness checks. `GET /health/ready` verifies PostgreSQL connectivity and reads the latest tracked migration; it returns `503` when the database is unavailable.

## Runtime architecture

```text
HTTP/BFF
  -> Supabase Auth
  -> database-backed TenantContext resolution
  -> Business API / Administration API
  -> application use cases
  -> repository / UnitOfWork ports
  -> PostgreSQL adapters
  -> postgres.js
  -> Supavisor Transaction Pooler
  -> Supabase PostgreSQL
```

Migration/seed tooling stays outside the Worker request lifecycle.

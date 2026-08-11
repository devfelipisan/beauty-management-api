# Supabase PostgreSQL runtime

`beauty-management-api` uses PostgreSQL/Supabase as the production persistence adapter. In-memory repositories are empty test doubles only; demo/business data is stored by PostgreSQL seeds and is never loaded into Worker memory.

## Configuration model

Runtime database access, migration tooling and Supabase Auth are separate concerns.

### Worker runtime

Preferred production configuration:

```env
AUTHENTICATION_ENABLED=false
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<transaction-pooler-host>:6543/postgres?sslmode=require
```

`DATABASE_URL` is sufficient by itself for PostgreSQL access in the Worker. The runtime does not require `SPIdBD`, `SBNameDB` or `SPPasswordDB` when an explicit URL is present.

The alternative decomposed form is supported when a single URI is not desired:

```env
SBDatabaseHost=<exact transaction pooler host>
SBDatabasePort=6543
SBDatabaseUser=postgres.<project-ref>
SBNameDB=postgres
SPPasswordDB=<database password>
```

No pooler hostname is inferred from `SPRegionDB`. Use the exact endpoint supplied by Supabase.

### Migration and seed tooling

Migrations are intentionally independent from the Worker runtime. Prefer an explicit direct connection:

```env
MIGRATION_DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

If `MIGRATION_DATABASE_URL` is not provided, `scripts/database.mjs` builds the direct connection from:

```env
SPIdBD=<project-ref>
SBNameDB=postgres
SPPasswordDB=<database password>
# optional:
# SBMigrationHost=
# SBMigrationPort=5432
# SBMigrationUser=postgres
```

The legacy `SPDatabaseConnectionMode` runtime-switch and `SPRegionDB` pooler-host derivation are not used by the database runner.

### Supabase Auth

Authentication remains disabled for the current MVP stage:

```env
AUTHENTICATION_ENABLED=false
```

When authentication is enabled in the future, configure Auth separately:

```env
AUTHENTICATION_ENABLED=true
SPIdBD=<project-ref>
ApiKeySupaBase=<publishable/anon key>
```

`ApiKeySupaBase` is not a PostgreSQL password and is never used to create the SQL connection.

## Cloudflare variables and secrets

For the current pre-auth runtime, only two settings are conceptually required:

```text
AUTHENTICATION_ENABLED=false     regular variable
DATABASE_URL                     secret
```

If the decomposed database configuration is used, only the password must be secret; host, port, user and database name may be normal Worker variables.

Do not commit real passwords or connection strings.

## Worker/PostgreSQL network controls

The Worker runtime deliberately minimizes PostgreSQL network round trips:

- `max: 1` keeps a single postgres.js connection per Worker isolate;
- `fetch_types: false` prevents postgres.js from issuing its automatic type-discovery query during connection initialization;
- `prepare: false` remains enabled while the runtime uses the Supabase transaction pooler;
- `connect_timeout: 5` fails a broken connection path earlier instead of keeping one Worker invocation waiting for a long time;
- `idle_timeout: 10` avoids holding idle edge connections longer than necessary.

The pre-auth workspace bootstrap is also implemented as a **single SQL query**. Tenant, role and active-professional data are joined in PostgreSQL and reconstructed into the workspace DTO in-process. This replaces the former three-query `Promise.all` fan-out and guarantees one application SQL round trip for both catalog loading and tenant resolution.

Workspace repository queries taking at least one second emit a structured warning with the query operation and duration. Connection strings, passwords and query parameters are never logged.

If Cloudflare still reports `Too many subrequests by single Worker invocation` after these controls, the next infrastructure step is to place **Cloudflare Hyperdrive** between the Worker and the Supabase direct PostgreSQL endpoint. Hyperdrive should then own runtime pooling; migrations remain on `MIGRATION_DATABASE_URL`. Do not increase Worker subrequest limits as the primary fix for a bootstrap operation that should require one database query.

## Tenant resolution

While authentication is disabled, the internal workspace bootstrap loads tenant, operational role and professional options directly from PostgreSQL. Request selectors are validated server-side before creating an `ExecutionContext`.

```text
GET /v1/bootstrap/workspace
  -> one PostgreSQL query
  -> app.tenants + identity.roles + app.professionals
  -> workspace catalog
```

Tenant-scoped operations continue to set the resolved tenant in the PostgreSQL transaction context and RLS. Frontend/BFF selectors are never treated as database authority.

When authentication is enabled later, the resolver switches to membership/RBAC identity:

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

Public requests remain separate and resolve `app.tenants.public_slug` directly in PostgreSQL.

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

## Health and readiness

`GET /health` and `GET /v1/health` are liveness checks.

`GET /health/ready` validates runtime database configuration before connecting. It reports:

- `status=ready`, `configuration=valid`, `database=connected` when the Worker can query PostgreSQL;
- `status=not_ready`, `configuration=invalid`, `database=not_tested` when runtime configuration is missing/invalid;
- `status=not_ready`, `configuration=valid`, `database=unavailable` when configuration exists but PostgreSQL cannot be reached.

Sensitive values are never returned by readiness responses.

Cloudflare subrequest exhaustion is classified as an infrastructure-capacity failure and returned as `503 INFRASTRUCTURE_LIMIT_EXCEEDED`, preserving the request id for log correlation instead of reporting an opaque `500 INTERNAL_ERROR`.

## Runtime architecture

```text
HTTP/BFF
  -> pre-auth workspace context (current stage)
  -> database-backed tenant resolution
  -> Business API / Administration API
  -> application use cases
  -> repository / UnitOfWork ports
  -> PostgreSQL adapters
  -> postgres.js
  -> Supavisor Transaction Pooler
  -> Supabase PostgreSQL
```

Migration/seed tooling stays outside the Worker request lifecycle.

# Supabase PostgreSQL runtime

`beauty-management-api` uses PostgreSQL/Supabase as the production persistence adapter. In-memory repositories remain only as empty test doubles; no demo/business dataset is loaded into Worker memory.

## Environment variables

| Variable | Purpose | Secret |
| --- | --- | --- |
| `SPRegionDB` | Supabase/AWS region used by the shared Supavisor pooler, e.g. `sa-east-1` | no |
| `SPIdBD` | Supabase project reference/id, e.g. `zkzzptgbiwsxinzmfvss` | no |
| `SBNameDB` | PostgreSQL database name, normally `postgres` | no |
| `SPPasswordDB` | PostgreSQL database password | **yes** |
| `ApiKeySupaBase` | Supabase publishable/anon API key used by Auth token verification | **yes** |

`ApiKeySupaBase` is not a PostgreSQL password and cannot be used in the PostgreSQL connection string.

The old runtime variables `API_DEV_AUTH_ID`, `API_AUTH_MODE`, `API_DEV_AUTH_SUBJECT` and `API_DEV_TENANT_ID` are not used by the production composition root.

## Connections

Application traffic runs through the Supabase shared transaction pooler:

```text
postgresql://postgres.<SPIdBD>:<SPPasswordDB>@aws-<SPRegionDB>.pooler.supabase.com:6543/<SBNameDB>
```

Migrations use the direct PostgreSQL endpoint:

```text
postgresql://postgres:<SPPasswordDB>@db.<SPIdBD>.supabase.co:5432/<SBNameDB>
```

The direct endpoint can require IPv6 depending on the Supabase project/network configuration. For a local IPv4-only environment, set `SPDatabaseConnectionMode=runtime` to execute the migration tool through the shared pooler instead.

## Local setup

Create `.dev.vars` from `.dev.vars.example` and populate the credentials without committing it.

```bash
npm install
npm run db:check
npm run db:migrate
npm run db:seed
npm run db:seed:check
```

Or run migration + seed + validation in sequence:

```bash
npm run db:setup
```

Migrations are tracked in `public.schema_migrations`, so a migration file is applied only once. Seeds are deterministic/idempotent and may be re-run for development/demo environments.

## Cloudflare configuration

Keep database/API credentials as Worker secrets:

```bash
npx wrangler secret put SPPasswordDB
npx wrangler secret put ApiKeySupaBase
```

Set `SPRegionDB`, `SPIdBD` and `SBNameDB` as Worker environment variables in the Cloudflare environment/dashboard. Do not place the database password or API key in `wrangler.jsonc`.

## Runtime architecture

```text
HTTP/BFF
  -> Business API / Administration API
  -> application use cases
  -> repository / UnitOfWork ports
  -> PostgreSQL adapters
  -> postgres.js
  -> Supavisor transaction pooler
  -> Supabase PostgreSQL
```

Migration/seed tooling is intentionally outside the Worker request lifecycle.

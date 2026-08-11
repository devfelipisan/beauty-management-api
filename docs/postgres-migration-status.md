# PostgreSQL migration status

`beauty-management-api` now uses PostgreSQL/Supabase as the production persistence runtime.

Migrated and composed in the production path:

- driver-neutral SQL client boundary plus `postgres.js` adapter;
- `PostgresUnitOfWork` with transactional `app.tenant_id` / `app.actor_id` context;
- tenant, branding, professional, service, customer, appointment, deposit, session and payment repositories;
- lead, equipment, package, assessment, technical-record and follow-up repositories;
- tenant settings, landing page, tenant user and commercial-policy repositories;
- append-only audit store;
- transactional outbox store;
- idempotency store;
- Supabase Auth verifier;
- database-backed access-control repository;
- canonical authenticated tenant resolution from `identity.users` + `identity.tenant_memberships` + `app.tenants`;
- professional identity mapping via `identity.professional_memberships`;
- public tenant resolution via `app.tenants.public_slug`;
- PostgreSQL migration/seed/security runner;
- liveness and database readiness endpoints.

The in-memory infrastructure is retained only as an empty test double for isolated unit/repository tests. It contains no production/demo business dataset and is not selected by the production composition root.

## Multi-tenant invariant

`x-tenant-id` is a selector hint only. The tenant propagated into `ExecutionContext` and PostgreSQL RLS must have been resolved from persisted membership data by the backend.

A user with one operational tenant may be resolved automatically. A user with multiple operational tenants must explicitly select one; the backend never chooses an arbitrary membership.

Professional operations also carry a database-resolved `professionalId`, allowing the backend to enforce own-appointment and linked-customer scope.

See `docs/multitenant-context.md` and `docs/supabase-postgres-runtime.md` for the operational contract.

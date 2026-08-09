# PostgreSQL migration status

Migrated into `beauty-management-api`:

- SQL client boundary;
- lead repository;
- access control repository;
- transactional repositories for tenants, branding, professionals, services, customers, appointments, deposits, sessions and payments;
- audit store;
- transactional outbox store;
- idempotency store;
- `PostgresUnitOfWork`;
- `createPostgresRuntime` infrastructure composition.

Runtime selection remains intentionally on the memory adapter until a Cloudflare-compatible PostgreSQL driver/binding is configured and validated.

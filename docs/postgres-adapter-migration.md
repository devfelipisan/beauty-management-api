# PostgreSQL adapter migration

The Business API owns PostgreSQL persistence. The Web/BFF must not instantiate database adapters.

Current migrated infrastructure boundary:

- `src/infrastructure/postgres/sql-client.ts`: driver-neutral SQL boundary;
- `src/infrastructure/postgres/postgres-lead.repository.ts`: PostgreSQL implementation of the Lead repository port;
- `src/infrastructure/postgres/postgres-access-control.repository.ts`: PostgreSQL implementation of the authorization access-control port.

The next persistence slice must migrate the transactional repositories and `PostgresUnitOfWork` before PostgreSQL becomes selectable by the API composition root. Until then, the production composition root remains on the current memory adapter; PostgreSQL adapters are present but intentionally not selected.

Target composition:

```text
BusinessApi
  -> Application Use Cases
  -> UnitOfWork / repository ports
  -> PostgresUnitOfWork
  -> SqlClient
  -> PostgreSQL-compatible driver / Supabase pooler
```

No use case or domain object may depend directly on a PostgreSQL driver or Supabase SDK.

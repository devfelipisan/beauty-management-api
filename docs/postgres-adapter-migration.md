# PostgreSQL adapter migration

The Business API owns PostgreSQL persistence. The Web/BFF must not instantiate database adapters.

## Current production composition

PostgreSQL/Supabase is now the production persistence adapter. The composition root no longer selects the in-memory runtime.

```text
BusinessApi / AdministrationApi
  -> Application Use Cases
  -> UnitOfWork / repository ports
  -> PostgreSQL repositories / PostgresUnitOfWork
  -> SqlClient
  -> postgres.js
  -> Supabase Supavisor transaction pooler
  -> PostgreSQL
```

Implemented persistence adapters include:

- transactional repositories through `PostgresUnitOfWork`;
- leads and access control;
- equipment and packages;
- assessments, technical records and follow-ups;
- tenant settings and landing page;
- tenant users and commercial policies.

The in-memory classes remain only as empty test doubles where isolated unit tests need them. They do not contain the demo/volume dataset and are not imported by the production composition root.

Migration and demo data now live under `database/migrations` and `database/seeds`. See `docs/supabase-postgres-runtime.md` for connection and execution instructions.

No use case or domain object depends directly on PostgreSQL, postgres.js or the Supabase SDK.

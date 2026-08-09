# PostgreSQL Unit of Work

The PostgreSQL adapter owns the concrete transaction boundary for business commands.

`PostgresUnitOfWork` opens one SQL transaction, applies `app.tenant_id` and `app.actor_id` through PostgreSQL session-local configuration, and exposes a `TransactionContext` containing tenant-aware repositories plus audit, outbox and idempotency stores.

The intended execution model is:

```text
BusinessApi -> UseCase -> UnitOfWork -> PostgreSQL transaction
                                  -> repositories
                                  -> audit
                                  -> outbox
                                  -> idempotency
```

No Application or Domain module depends on PostgreSQL or a specific managed provider. Runtime composition injects a `SqlClient` into `createPostgresRuntime`.

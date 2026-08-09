# PostgreSQL runtime selection

The API must not switch the production composition root from memory to PostgreSQL until the SQL driver and connection binding are configured in the Cloudflare runtime.

`createPostgresRuntime(sqlClient)` is now available as the infrastructure composition boundary. The remaining step is to provide a Cloudflare-compatible `SqlClient` implementation and select it from the backend composition root using backend-only configuration.

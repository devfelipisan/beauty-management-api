# Cloudflare Worker performance guardrails

The API is I/O-oriented. Increasing Worker CPU allowance is not a substitute for reducing PostgreSQL latency or query cardinality.

## CPU budget

The production account currently runs on the Cloudflare Workers Free plan. Wrangler `limits.cpu_ms` is not supported on Free-plan deployments, so `wrangler.jsonc` intentionally does not declare a CPU limit. Adding `limits.cpu_ms` causes Cloudflare API error `100328` during `wrangler versions upload`.

When the account is upgraded to a paid Standard Usage Model, an explicit CPU ceiling can be configured as a deployment guardrail. Until then, CPU usage must be monitored through Workers observability and optimized in code instead of declaring an unsupported limit.

CPU time and wall-clock time must be interpreted separately. Time spent waiting on PostgreSQL/network I/O can make a request slow without consuming an equivalent amount of Worker CPU.

## PostgreSQL slow-query telemetry

Workspace queries emit a structured `postgres.query.slow` warning when their wall-clock duration reaches the configured threshold.

Configuration:

```env
POSTGRES_SLOW_QUERY_MS=750
```

If omitted or invalid, the runtime uses 750 ms.

The warning contains only operational metadata:

- `operation`
- `durationMs`
- `rowCount`
- `thresholdMs`

Connection strings, credentials, SQL parameters and tenant/client payloads must never be logged.

## Performance investigation order

When workspace bootstrap latency rises:

1. inspect query cardinality and query plan;
2. verify PostgreSQL/network latency;
3. verify connection topology and pooling;
4. inspect Worker CPU usage;
5. configure or increase CPU limits only after upgrading to a paid Standard Usage Model and only when measured CPU work justifies it.

Hyperdrive is the planned production connection layer after query/cardinality optimization. Runtime pooling and migration connections remain separate concerns.

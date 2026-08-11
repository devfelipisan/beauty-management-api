# Cloudflare Worker performance guardrails

The API is I/O-oriented. Increasing Worker CPU allowance is not a substitute for reducing PostgreSQL latency or query cardinality.

## CPU budget

`wrangler.jsonc` declares a 30,000 ms CPU ceiling for deployed Standard Usage Model environments. This is a guardrail, not a target. Local development does not enforce the Cloudflare runtime CPU limit.

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
5. increase CPU limits only when measured CPU work justifies it.

Hyperdrive is the planned production connection layer after query/cardinality optimization. Runtime pooling and migration connections remain separate concerns.

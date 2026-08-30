CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  tenant_id uuid NOT NULL REFERENCES tenants(id), operation text NOT NULL,
  idempotency_key text NOT NULL, request_hash text NOT NULL,
  response_status integer, response_body jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz, PRIMARY KEY (tenant_id, operation, idempotency_key)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), event_type text NOT NULL,
  actor_id text, aggregate_type text, aggregate_id uuid, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), event_type text NOT NULL,
  aggregate_type text, aggregate_id uuid, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz, attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_occurred ON audit_events (tenant_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_outbox_events_pending ON outbox_events (created_at) WHERE published_at IS NULL;

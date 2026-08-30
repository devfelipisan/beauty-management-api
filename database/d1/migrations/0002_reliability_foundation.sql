CREATE TABLE IF NOT EXISTS idempotency_records (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, operation TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL, response_payload TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS ux_idempotency_tenant_operation_key ON idempotency_records(tenant_id, operation, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_tenant_created ON idempotency_records(tenant_id, created_at);
CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, tenant_id TEXT, actor_id TEXT, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT, request_id TEXT NOT NULL, correlation_id TEXT NOT NULL, metadata_json TEXT, occurred_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_occurred ON audit_events(tenant_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(tenant_id, resource_type, resource_id);
CREATE TABLE IF NOT EXISTS outbox_events (id TEXT PRIMARY KEY, tenant_id TEXT, event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, correlation_id TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, published_at TEXT);
CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_created ON outbox_events(tenant_id, created_at);

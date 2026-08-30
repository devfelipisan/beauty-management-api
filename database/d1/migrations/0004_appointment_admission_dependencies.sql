ALTER TABLE services ADD COLUMN requires_assessment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN blocked_for_new_appointments INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS licenses (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, plan_id TEXT NOT NULL, subscription_reference TEXT, starts_at TEXT NOT NULL, expires_at TEXT, tolerance_until TEXT, status TEXT NOT NULL, limits_json TEXT NOT NULL, enabled_resources_json TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id));
CREATE INDEX IF NOT EXISTS idx_licenses_tenant_starts ON licenses(tenant_id, starts_at DESC);
CREATE TABLE IF NOT EXISTS assessments (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, service_id TEXT NOT NULL, professional_id TEXT NOT NULL, result TEXT NOT NULL, performed_at TEXT NOT NULL, valid_until TEXT, created_at TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id));
CREATE INDEX IF NOT EXISTS idx_assessments_admission ON assessments(tenant_id, customer_id, service_id, professional_id, performed_at DESC);

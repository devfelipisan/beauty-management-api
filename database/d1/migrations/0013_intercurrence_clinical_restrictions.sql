CREATE TABLE IF NOT EXISTS intercurrences (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, customer_id TEXT NOT NULL,
  service_id TEXT NOT NULL, professional_id TEXT NOT NULL, type_code TEXT NOT NULL, severity TEXT NOT NULL,
  description TEXT NOT NULL, conduct TEXT NOT NULL, equipment_usage_id TEXT, power_record_id TEXT,
  requires_follow_up INTEGER NOT NULL DEFAULT 0, requires_reassessment INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, occurred_at TEXT NOT NULL, reported_at TEXT NOT NULL, reported_by TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_intercurrences_session ON intercurrences(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_intercurrences_customer_status ON intercurrences(tenant_id, customer_id, status);
CREATE TABLE IF NOT EXISTS clinical_restrictions (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, source_type TEXT NOT NULL,
  source_id TEXT NOT NULL, scope TEXT NOT NULL, blocks_new_appointments INTEGER NOT NULL DEFAULT 0,
  requires_reassessment INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, effective_from TEXT NOT NULL,
  resolved_at TEXT, created_at TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE (tenant_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_clinical_restrictions_customer ON clinical_restrictions(tenant_id, customer_id, status, blocks_new_appointments);
CREATE TABLE IF NOT EXISTS customer_clinical_restrictions (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, restriction_id TEXT NOT NULL, customer_id TEXT NOT NULL,
  source_type TEXT NOT NULL, source_id TEXT NOT NULL, blocks_new_appointments INTEGER NOT NULL,
  requires_reassessment INTEGER NOT NULL, status TEXT NOT NULL, activated_at TEXT NOT NULL, resolved_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), UNIQUE (tenant_id, restriction_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_clinical_restrictions_admission ON customer_clinical_restrictions(tenant_id, customer_id, status, blocks_new_appointments);

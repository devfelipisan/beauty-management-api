CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  started_by TEXT NOT NULL,
  completed_at TEXT,
  completed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE (tenant_id, appointment_id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_appointment ON sessions(tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_professional_status ON sessions(tenant_id, professional_id, status);

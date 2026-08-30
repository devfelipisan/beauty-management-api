CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT,
  confirmed_at TEXT,
  canceled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_deposits_tenant_appointment ON deposits(tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_deposits_tenant_status ON deposits(tenant_id, status, expires_at);

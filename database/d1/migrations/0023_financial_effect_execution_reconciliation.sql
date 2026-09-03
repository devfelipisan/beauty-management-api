CREATE TABLE IF NOT EXISTS financial_reconciliation_issues (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  issue_type TEXT NOT NULL CHECK(issue_type IN ('STALE_FINANCIAL_DECISION','FINANCIAL_DECISION_CONFLICT','FINANCIAL_STATE_INCONSISTENT')),
  reason_code TEXT NOT NULL,
  expected_fingerprint TEXT NOT NULL,
  actual_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('OPEN','RESOLVED')) DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(tenant_id,source_event_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_financial_reconciliation_open ON financial_reconciliation_issues(tenant_id,status,created_at);

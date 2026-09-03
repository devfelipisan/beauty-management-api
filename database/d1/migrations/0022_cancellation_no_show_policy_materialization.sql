CREATE TABLE IF NOT EXISTS cancellation_policies (
  id TEXT NOT NULL, tenant_id TEXT NOT NULL, version INTEGER NOT NULL,
  service_id TEXT, status TEXT NOT NULL CHECK(status IN ('ACTIVE','INACTIVE')),
  effective_from TEXT NOT NULL, effective_until TEXT,
  customer_deposit_disposition TEXT NOT NULL CHECK(customer_deposit_disposition IN ('NONE','RETURN','RETAIN','CONVERT_TO_CREDIT','TRANSFER')),
  company_deposit_disposition TEXT NOT NULL CHECK(company_deposit_disposition IN ('NONE','RETURN','RETAIN','CONVERT_TO_CREDIT','TRANSFER')),
  professional_deposit_disposition TEXT NOT NULL CHECK(professional_deposit_disposition IN ('NONE','RETURN','RETAIN','CONVERT_TO_CREDIT','TRANSFER')),
  payment_disposition TEXT NOT NULL CHECK(payment_disposition IN ('NONE','REFUND','CONVERT_TO_CREDIT','RETAIN')),
  receivable_disposition TEXT NOT NULL CHECK(receivable_disposition IN ('KEEP','CANCEL')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id,id,version), FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_cancellation_policy_lookup ON cancellation_policies(tenant_id,service_id,status,effective_from,effective_until,version);
CREATE TABLE IF NOT EXISTS no_show_policies (
  id TEXT NOT NULL, tenant_id TEXT NOT NULL, version INTEGER NOT NULL,
  service_id TEXT, status TEXT NOT NULL CHECK(status IN ('ACTIVE','INACTIVE')),
  tolerance_minutes INTEGER NOT NULL CHECK(tolerance_minutes >= 0),
  deposit_disposition TEXT NOT NULL CHECK(deposit_disposition IN ('NONE','RETURN','RETAIN','CONVERT_TO_CREDIT','TRANSFER')),
  relationship_impact TEXT NOT NULL CHECK(relationship_impact IN ('NONE','NO_SHOW')),
  effective_from TEXT NOT NULL, effective_until TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id,id,version), FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_no_show_policy_lookup ON no_show_policies(tenant_id,service_id,status,effective_from,effective_until,version);
ALTER TABLE appointment_cancellation_history ADD COLUMN financial_decision_json TEXT;

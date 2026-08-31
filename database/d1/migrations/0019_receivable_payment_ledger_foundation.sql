CREATE TABLE IF NOT EXISTS receivables (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('APPOINTMENT','CUSTOMER_PACKAGE')),
  source_id TEXT NOT NULL, appointment_id TEXT, session_id TEXT, customer_package_id TEXT,
  gross_amount_cents INTEGER NOT NULL CHECK(gross_amount_cents >= 0),
  discount_amount_cents INTEGER NOT NULL CHECK(discount_amount_cents >= 0 AND discount_amount_cents <= gross_amount_cents),
  net_amount_cents INTEGER NOT NULL CHECK(net_amount_cents = gross_amount_cents - discount_amount_cents),
  deposit_applied_cents INTEGER NOT NULL DEFAULT 0 CHECK(deposit_applied_cents >= 0 AND deposit_applied_cents <= net_amount_cents),
  paid_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount_cents >= 0 AND paid_amount_cents <= net_amount_cents),
  outstanding_amount_cents INTEGER NOT NULL CHECK(outstanding_amount_cents >= 0 AND outstanding_amount_cents <= net_amount_cents),
  status TEXT NOT NULL CHECK(status IN ('OPEN','PARTIALLY_PAID','PAID')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(tenant_id, source_type, source_id), FOREIGN KEY(tenant_id) REFERENCES tenants(id), FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS idx_receivables_customer ON receivables(tenant_id,customer_id,status,created_at);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, receivable_id TEXT NOT NULL, customer_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), method TEXT NOT NULL CHECK(method IN ('CASH','PIX','DEBIT_CARD','CREDIT_CARD','TRANSFER','INTERNAL_CREDIT')),
  status TEXT NOT NULL CHECK(status IN ('CONFIRMED')), received_at TEXT NOT NULL, received_by TEXT NOT NULL,
  external_reference TEXT, notes TEXT, created_at TEXT NOT NULL,
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id) REFERENCES tenants(id), FOREIGN KEY(receivable_id) REFERENCES receivables(id)
);
CREATE INDEX IF NOT EXISTS idx_payments_receivable ON payments(tenant_id,receivable_id,received_at,id);
CREATE TABLE IF NOT EXISTS ledger_movements (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, receivable_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('RECEIVABLE_CREATED','DEPOSIT_APPLIED','PAYMENT_RECEIVED')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), direction TEXT NOT NULL CHECK(direction IN ('CREDIT','DEBIT')),
  source_type TEXT NOT NULL, source_id TEXT NOT NULL, occurred_at TEXT NOT NULL, created_by TEXT NOT NULL, correlation_id TEXT NOT NULL,
  UNIQUE(tenant_id,type,source_type,source_id,receivable_id), FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_ledger_receivable ON ledger_movements(tenant_id,receivable_id,occurred_at,id);
CREATE TABLE IF NOT EXISTS uow_assertions (id TEXT PRIMARY KEY, expected_changes INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS uow_assertion_check BEFORE INSERT ON uow_assertions WHEN changes() <> NEW.expected_changes BEGIN SELECT RAISE(ABORT,'UNIT_OF_WORK_EXPECTED_CHANGES'); END;

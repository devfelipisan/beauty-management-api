ALTER TABLE services ADD COLUMN allows_discount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE services ADD COLUMN minimum_price_cents INTEGER;
ALTER TABLE services ADD COLUMN deposit_mode TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE services ADD COLUMN deposit_fixed_cents INTEGER;
ALTER TABLE services ADD COLUMN deposit_percentage_basis_points INTEGER;

CREATE TABLE IF NOT EXISTS discount_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_profile TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value INTEGER NOT NULL,
  eligible_services_json TEXT,
  eligible_categories_json TEXT,
  minimum_purchase_cents INTEGER,
  maximum_discount_cents INTEGER,
  valid_from TEXT,
  valid_until TEXT,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  single_use INTEGER NOT NULL DEFAULT 0,
  stackable INTEGER NOT NULL DEFAULT 0,
  priority INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_discount_policies_applicable ON discount_policies(tenant_id, customer_profile, valid_from, valid_until, priority);

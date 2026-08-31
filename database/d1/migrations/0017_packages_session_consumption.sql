CREATE TABLE IF NOT EXISTS package_definitions (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, service_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
 base_price_cents INTEGER NOT NULL CHECK(base_price_cents >= 0), discount_cents INTEGER NOT NULL CHECK(discount_cents >= 0 AND discount_cents <= base_price_cents),
 final_price_cents INTEGER NOT NULL CHECK(final_price_cents >= 0), validity_days INTEGER, status TEXT NOT NULL CHECK(status IN ('ACTIVE','INACTIVE')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
CREATE TABLE IF NOT EXISTS customer_packages (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, package_definition_id TEXT, customer_id TEXT NOT NULL, service_id TEXT NOT NULL,
 total_quantity INTEGER NOT NULL CHECK(total_quantity > 0), remaining_quantity INTEGER NOT NULL CHECK(remaining_quantity >= 0 AND remaining_quantity <= total_quantity),
 base_price_cents INTEGER NOT NULL CHECK(base_price_cents >= 0), discount_cents INTEGER NOT NULL CHECK(discount_cents >= 0 AND discount_cents <= base_price_cents), final_price_cents INTEGER NOT NULL CHECK(final_price_cents >= 0),
 purchased_at TEXT NOT NULL, valid_until TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ACTIVE','COMPLETED','EXPIRED','CANCELED')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id) REFERENCES tenants(id), FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS idx_customer_packages_customer ON customer_packages(tenant_id,customer_id,status,valid_until);
CREATE INDEX IF NOT EXISTS idx_customer_packages_service ON customer_packages(tenant_id,service_id,status);
CREATE TABLE IF NOT EXISTS package_movements (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_package_id TEXT NOT NULL, customer_id TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('INITIAL_CREDIT','CONSUMPTION')), quantity INTEGER NOT NULL CHECK(quantity > 0),
 balance_before INTEGER NOT NULL CHECK(balance_before >= 0), balance_after INTEGER NOT NULL CHECK(balance_after >= 0), session_id TEXT, appointment_id TEXT, source_event_id TEXT NOT NULL, occurred_at TEXT NOT NULL, created_by TEXT NOT NULL,
 UNIQUE(tenant_id,session_id,type), FOREIGN KEY(tenant_id) REFERENCES tenants(id), FOREIGN KEY(customer_package_id) REFERENCES customer_packages(id)
);
CREATE INDEX IF NOT EXISTS idx_package_movements_package ON package_movements(tenant_id,customer_package_id,occurred_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_package_movements_session ON package_movements(tenant_id,session_id,type);
ALTER TABLE appointments ADD COLUMN customer_package_id TEXT;
ALTER TABLE sessions ADD COLUMN customer_package_id TEXT;

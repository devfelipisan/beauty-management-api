CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, model TEXT, manufacturer TEXT,
  serial_number TEXT, main_unit TEXT, status TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_equipment_tenant_status ON equipment(tenant_id, status);
CREATE TABLE IF NOT EXISTS equipment_service_compatibility (
  tenant_id TEXT NOT NULL, equipment_id TEXT NOT NULL, service_id TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, equipment_id, service_id), FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_equipment_compatibility_service ON equipment_service_compatibility(tenant_id, service_id, equipment_id);
CREATE TABLE IF NOT EXISTS session_equipment_usage (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, equipment_id TEXT NOT NULL,
  equipment_name_snapshot TEXT NOT NULL, equipment_model_snapshot TEXT, manufacturer_snapshot TEXT,
  serial_number_snapshot TEXT, main_unit_snapshot TEXT, recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_session_equipment_usage_session ON session_equipment_usage(tenant_id, session_id);
CREATE TABLE IF NOT EXISTS variation_policies (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, service_id TEXT NOT NULL, parameter_key TEXT NOT NULL,
  mode TEXT NOT NULL, threshold TEXT NOT NULL, unit TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), UNIQUE (tenant_id, service_id, parameter_key, status)
);
CREATE INDEX IF NOT EXISTS idx_variation_policies_lookup ON variation_policies(tenant_id, service_id, parameter_key, status);
CREATE TABLE IF NOT EXISTS session_variation_alerts (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, parameter_key TEXT NOT NULL,
  previous_session_id TEXT, previous_value TEXT, current_value TEXT NOT NULL, unit TEXT, policy_id TEXT NOT NULL,
  policy_snapshot_json TEXT NOT NULL, threshold TEXT NOT NULL, variation TEXT NOT NULL, status TEXT NOT NULL,
  justification TEXT, justified_at TEXT, justified_by TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_session_variation_alerts_session ON session_variation_alerts(tenant_id, session_id, status);

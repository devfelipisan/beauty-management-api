ALTER TABLE services ADD COLUMN requires_equipment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE services ADD COLUMN requires_photography INTEGER NOT NULL DEFAULT 0;
ALTER TABLE services ADD COLUMN has_technical_form INTEGER NOT NULL DEFAULT 0;
ALTER TABLE services ADD COLUMN technical_requirements_json TEXT;

CREATE TABLE IF NOT EXISTS technical_forms (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, service_id TEXT NOT NULL,
  version INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), UNIQUE (tenant_id, service_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_technical_forms_active ON technical_forms(tenant_id, service_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_technical_forms_service_status ON technical_forms(tenant_id, service_id, status);
CREATE TABLE IF NOT EXISTS technical_form_fields (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, form_id TEXT NOT NULL, field_key TEXT NOT NULL,
  name TEXT NOT NULL, description TEXT, field_type TEXT NOT NULL, field_order INTEGER NOT NULL,
  required INTEGER NOT NULL DEFAULT 0, minimum TEXT, maximum TEXT, precision INTEGER,
  unit TEXT, options_json TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE',
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (form_id) REFERENCES technical_forms(id),
  UNIQUE (tenant_id, form_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_technical_form_fields_order ON technical_form_fields(tenant_id, form_id, field_order);

CREATE TABLE IF NOT EXISTS session_technical_form_snapshots (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, service_id TEXT NOT NULL,
  form_id TEXT NOT NULL, form_version INTEGER NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (form_id) REFERENCES technical_forms(id),
  UNIQUE (tenant_id, session_id)
);
CREATE TABLE IF NOT EXISTS session_technical_field_snapshots (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, field_key TEXT NOT NULL,
  name TEXT NOT NULL, description TEXT, field_type TEXT NOT NULL, field_order INTEGER NOT NULL,
  required INTEGER NOT NULL, minimum TEXT, maximum TEXT, precision INTEGER, unit TEXT, options_json TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (snapshot_id) REFERENCES session_technical_form_snapshots(id),
  UNIQUE (tenant_id, snapshot_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_session_technical_fields_order ON session_technical_field_snapshots(tenant_id, snapshot_id, field_order);
CREATE TABLE IF NOT EXISTS session_technical_values (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, field_snapshot_id TEXT NOT NULL,
  value_type TEXT NOT NULL, text_value TEXT, integer_value INTEGER, decimal_value TEXT, boolean_value INTEGER,
  date_value TEXT, time_value TEXT, json_value TEXT, unit TEXT, recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (field_snapshot_id) REFERENCES session_technical_field_snapshots(id),
  UNIQUE (tenant_id, session_id, field_snapshot_id)
);
CREATE INDEX IF NOT EXISTS idx_session_technical_values_session ON session_technical_values(tenant_id, session_id);
CREATE TABLE IF NOT EXISTS session_power_records (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, value TEXT NOT NULL, unit TEXT NOT NULL,
  recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_session_power_records_session ON session_power_records(tenant_id, session_id, recorded_at);

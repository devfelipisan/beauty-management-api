ALTER TABLE appointments ADD COLUMN cancellation_origin TEXT;
ALTER TABLE appointments ADD COLUMN cancellation_reason TEXT;
ALTER TABLE appointments ADD COLUMN cancellation_note TEXT;
ALTER TABLE appointments ADD COLUMN canceled_at TEXT;
ALTER TABLE appointments ADD COLUMN canceled_by TEXT;
CREATE TABLE IF NOT EXISTS appointment_reschedule_history (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,appointment_id TEXT NOT NULL,previous_starts_at TEXT NOT NULL,previous_ends_at TEXT NOT NULL,previous_professional_id TEXT NOT NULL,new_starts_at TEXT NOT NULL,new_ends_at TEXT NOT NULL,new_professional_id TEXT NOT NULL,reason TEXT NOT NULL,changed_at TEXT NOT NULL,changed_by TEXT NOT NULL,source_request_id TEXT NOT NULL,UNIQUE(tenant_id,source_request_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id));
CREATE TABLE IF NOT EXISTS appointment_cancellation_history (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,appointment_id TEXT NOT NULL,reason TEXT NOT NULL,note TEXT,origin TEXT NOT NULL,changed_at TEXT NOT NULL,changed_by TEXT NOT NULL,source_request_id TEXT NOT NULL,UNIQUE(tenant_id,source_request_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id));

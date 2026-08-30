CREATE TABLE IF NOT EXISTS clinical_photo_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  intercurrence_id TEXT,
  purpose TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum TEXT,
  etag TEXT,
  status TEXT NOT NULL,
  captured_at TEXT,
  uploaded_at TEXT,
  uploaded_by TEXT NOT NULL,
  failure_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (intercurrence_id) REFERENCES intercurrences(id)
);
CREATE INDEX IF NOT EXISTS idx_clinical_photo_session_status ON clinical_photo_attachments(tenant_id, session_id, status);
CREATE INDEX IF NOT EXISTS idx_clinical_photo_intercurrence_status ON clinical_photo_attachments(tenant_id, intercurrence_id, status);
CREATE INDEX IF NOT EXISTS idx_clinical_photo_tenant_id ON clinical_photo_attachments(tenant_id, id);

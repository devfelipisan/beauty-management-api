CREATE TABLE IF NOT EXISTS customer_timeline_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source_worker TEXT NOT NULL,
  source_aggregate_type TEXT NOT NULL,
  source_aggregate_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  service_id TEXT,
  professional_id TEXT,
  status TEXT,
  summary_code TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, source_event_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS idx_customer_timeline_customer_time ON customer_timeline_events(tenant_id, customer_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_customer_timeline_customer_type ON customer_timeline_events(tenant_id, customer_id, event_type, occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS customer_relationship_stats (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  completed_sessions_count INTEGER NOT NULL DEFAULT 0,
  last_completed_session_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, customer_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS relationship_profile_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  previous_profile TEXT NOT NULL,
  new_profile TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  UNIQUE (tenant_id, source_event_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS return_recommendations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONVERTED')),
  recommended_at TEXT NOT NULL,
  recommended_for TEXT,
  interval_value INTEGER,
  interval_unit TEXT,
  reason_code TEXT,
  observation TEXT,
  appointment_id TEXT,
  created_at TEXT NOT NULL,
  converted_at TEXT,
  UNIQUE (tenant_id, session_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS idx_returns_pending_due ON return_recommendations(tenant_id, status, recommended_for);

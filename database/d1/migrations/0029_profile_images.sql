CREATE TABLE profile_images (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
  owner_type TEXT NOT NULL CHECK(owner_type='customer'), owner_id TEXT NOT NULL REFERENCES customers(id),
  image_role TEXT NOT NULL CHECK(image_role='PROFILE'), object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 2000000),
  checksum TEXT NOT NULL, etag TEXT, version INTEGER NOT NULL CHECK(version > 0),
  status TEXT NOT NULL CHECK(status IN ('PENDING','AVAILABLE','RETIRED','REMOVED')),
  uploaded_by TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,idempotency_key)
);
CREATE UNIQUE INDEX profile_image_active ON profile_images(tenant_id,owner_type,owner_id,image_role) WHERE status='AVAILABLE';
CREATE TABLE profile_image_slots (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), owner_id TEXT NOT NULL REFERENCES customers(id),
  image_role TEXT NOT NULL CHECK(image_role='PROFILE'), version INTEGER NOT NULL DEFAULT 0,
  image_id TEXT REFERENCES profile_images(id), PRIMARY KEY(tenant_id,owner_id,image_role)
);
CREATE INDEX profile_image_owner ON profile_images(tenant_id,owner_id,status);

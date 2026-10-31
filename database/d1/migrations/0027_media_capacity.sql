-- Production stays closed until the controlled inventory and policy approval.
CREATE TABLE media_capacity (
  bucket TEXT PRIMARY KEY CHECK (bucket = 'beauty-r2'),
  limit_bytes INTEGER NOT NULL CHECK (limit_bytes = 8000000000),
  charged_bytes INTEGER NOT NULL DEFAULT 0 CHECK (charged_bytes >= 0),
  inventory_approved INTEGER NOT NULL DEFAULT 0 CHECK (inventory_approved IN (0,1)),
  policy_approved INTEGER NOT NULL DEFAULT 0 CHECK (policy_approved IN (0,1)),
  writers_coordinated INTEGER NOT NULL DEFAULT 0 CHECK (writers_coordinated IN (0,1)),
  approval_reference TEXT
);
INSERT INTO media_capacity (bucket,limit_bytes) VALUES ('beauty-r2',8000000000);
CREATE TABLE tenant_media_capacity (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  limit_bytes INTEGER NOT NULL CHECK (limit_bytes > 0 AND limit_bytes <= 8000000000),
  charged_bytes INTEGER NOT NULL DEFAULT 0 CHECK (charged_bytes >= 0)
);
CREATE TABLE media_objects (
  object_key TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  domain TEXT NOT NULL CHECK (domain IN ('clinical','profile')),
  resource_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  status TEXT NOT NULL CHECK (status IN ('RESERVED','STORED','DELETE_PENDING','RELEASED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,operation,idempotency_key)
);
CREATE INDEX media_objects_resource ON media_objects(tenant_id,domain,resource_id);
CREATE TRIGGER media_capacity_reserve BEFORE INSERT ON media_objects BEGIN
  SELECT CASE WHEN NEW.status != 'RESERVED' THEN RAISE(ABORT,'MEDIA_INVALID_RESERVATION') END;
  UPDATE media_capacity SET charged_bytes = charged_bytes + NEW.size_bytes
    WHERE bucket = 'beauty-r2' AND inventory_approved = 1 AND policy_approved = 1
      AND writers_coordinated = 1 AND approval_reference IS NOT NULL
      AND charged_bytes + NEW.size_bytes <= limit_bytes;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT,'MEDIA_CAPACITY_UNAVAILABLE') END;
  UPDATE tenant_media_capacity SET charged_bytes = charged_bytes + NEW.size_bytes
    WHERE tenant_id = NEW.tenant_id AND charged_bytes + NEW.size_bytes <= limit_bytes;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT,'MEDIA_TENANT_QUOTA_UNAVAILABLE') END;
END;
CREATE TRIGGER media_capacity_immutable BEFORE UPDATE ON media_objects
WHEN NEW.object_key != OLD.object_key OR NEW.tenant_id != OLD.tenant_id
  OR NEW.size_bytes != OLD.size_bytes OR NEW.domain != OLD.domain
  OR NEW.operation != OLD.operation OR NEW.idempotency_key != OLD.idempotency_key
  OR NEW.resource_id != OLD.resource_id OR OLD.status = 'RELEASED'
BEGIN SELECT RAISE(ABORT,'MEDIA_RESERVATION_IMMUTABLE'); END;
CREATE TRIGGER media_capacity_release AFTER UPDATE OF status ON media_objects
WHEN NEW.status = 'RELEASED' AND OLD.status != 'RELEASED' BEGIN
  UPDATE media_capacity SET charged_bytes = charged_bytes - OLD.size_bytes WHERE bucket = 'beauty-r2';
  UPDATE tenant_media_capacity SET charged_bytes = charged_bytes - OLD.size_bytes WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER media_capacity_no_delete BEFORE DELETE ON media_objects
BEGIN SELECT RAISE(ABORT,'MEDIA_LEDGER_DELETE_FORBIDDEN'); END;

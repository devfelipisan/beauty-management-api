-- External identity is separate from tenant membership and current permissions.
-- No roles, permissions or memberships are granted by this migration.
CREATE TABLE identities (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (issuer, subject)
);

CREATE UNIQUE INDEX ux_professionals_tenant_id ON professionals(tenant_id, id);
CREATE TABLE tenant_memberships (
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  professional_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, actor_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (actor_id) REFERENCES identities(id),
  FOREIGN KEY (tenant_id, professional_id) REFERENCES professionals(tenant_id, id)
);
CREATE INDEX idx_memberships_actor_active ON tenant_memberships(actor_id, active);

CREATE TABLE roles (
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  PRIMARY KEY (tenant_id, name),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE TABLE permissions (code TEXT PRIMARY KEY);
CREATE TABLE role_permissions (
  tenant_id TEXT NOT NULL,
  role_name TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  PRIMARY KEY (tenant_id, role_name, permission_code),
  FOREIGN KEY (tenant_id, role_name) REFERENCES roles(tenant_id, name),
  FOREIGN KEY (permission_code) REFERENCES permissions(code)
);
CREATE TABLE membership_roles (
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  role_name TEXT NOT NULL,
  PRIMARY KEY (tenant_id, actor_id, role_name),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES tenant_memberships(tenant_id, actor_id),
  FOREIGN KEY (tenant_id, role_name) REFERENCES roles(tenant_id, name)
);

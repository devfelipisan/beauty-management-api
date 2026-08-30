import type { D1DatabaseLike } from '../../../../../libs/database/src/d1/d1.types.js';
import { Tenant, type TenantProps } from '../domain/tenant.js';
import type { TenantRepository } from '../ports/tenant-repository.js';

type TenantRow = TenantProps & { id: string; legal_name: string; display_name: string; created_at: string; updated_at: string };
export class D1TenantRepository implements TenantRepository {
  constructor(private readonly db: D1DatabaseLike) {}
  private map(row: TenantRow): Tenant { return Tenant.create(row.id, { legalName: row.legal_name, displayName: row.display_name, document: row.document, timezone: row.timezone, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }); }
  async findById(id: string) { const row = await this.db.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first<TenantRow>(); return row ? this.map(row) : null; }
  async findByDocument(document: string) { const row = await this.db.prepare('SELECT * FROM tenants WHERE document = ?').bind(document.replace(/\D/g, '')).first<TenantRow>(); return row ? this.map(row) : null; }
  async create(tenant: Tenant) { const t = tenant.data; await this.db.prepare('INSERT INTO tenants (id, legal_name, display_name, document, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(tenant.id, t.legalName, t.displayName, t.document, t.timezone, t.status, t.createdAt, t.updatedAt).run(); }
  async update(tenant: Tenant) { const t = tenant.data; await this.db.prepare('UPDATE tenants SET legal_name = ?, display_name = ?, document = ?, timezone = ?, status = ?, updated_at = ? WHERE id = ?').bind(t.legalName, t.displayName, t.document, t.timezone, t.status, t.updatedAt, tenant.id).run(); }
}

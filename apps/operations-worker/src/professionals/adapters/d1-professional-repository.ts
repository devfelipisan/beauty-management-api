import { Inject, Injectable } from '@nestjs/common';
import { D1_DATABASE, type D1DatabaseLike } from '../../../../../libs/database/src/index.js';
import { Professional, type ProfessionalProps } from '../domain/professional.js';
import type { ProfessionalRepository } from '../ports/professional-repository.js';
type Row = { id: string; tenant_id: string; name: string; status: ProfessionalProps['status']; public_visible: number; created_at: string; updated_at: string };
@Injectable()
export class D1ProfessionalRepository implements ProfessionalRepository {
  constructor(@Inject(D1_DATABASE) private readonly db: D1DatabaseLike) {}
  private map(r: Row) { return Professional.create(r.id, { tenantId: r.tenant_id, name: r.name, status: r.status, publicVisible: Boolean(r.public_visible), createdAt: r.created_at, updatedAt: r.updated_at }); }
  async findById(tenantId: string, id: string) { const r = await this.db.prepare('SELECT * FROM professionals WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first<Row>(); return r ? this.map(r) : null; }
  async list(tenantId: string, limit: number, cursor?: string) { const r = await this.db.prepare(cursor ? 'SELECT * FROM professionals WHERE tenant_id = ? AND id > ? ORDER BY id LIMIT ?' : 'SELECT * FROM professionals WHERE tenant_id = ? ORDER BY id LIMIT ?').bind(...(cursor ? [tenantId, cursor, limit] : [tenantId, limit])).all<Row>(); return r.results.map((row) => this.map(row)); }
  async create(p: Professional) { const x = p.data; await this.db.prepare('INSERT INTO professionals (id, tenant_id, name, status, public_visible, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(p.id, x.tenantId, x.name, x.status, x.publicVisible ? 1 : 0, x.createdAt, x.updatedAt).run(); }
  async update(p: Professional) { const x = p.data; await this.db.prepare('UPDATE professionals SET name = ?, status = ?, public_visible = ?, updated_at = ? WHERE tenant_id = ? AND id = ?').bind(x.name, x.status, x.publicVisible ? 1 : 0, x.updatedAt, x.tenantId, p.id).run(); }
}

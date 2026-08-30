import { Inject, Injectable } from '@nestjs/common';
import { D1_DATABASE, type D1DatabaseLike } from '../../../../../libs/database/src/index.js';
import { Service, type ServiceProps } from '../domain/service.js';
import type { ServiceRepository } from '../ports/service-repository.js';
type Row = { id: string; tenant_id: string; name: string; category: string; duration_minutes: number; base_price_cents: number; status: ServiceProps['status']; created_at: string; updated_at: string };
@Injectable()
export class D1ServiceRepository implements ServiceRepository {
  constructor(@Inject(D1_DATABASE) private readonly db: D1DatabaseLike) {}
  private map(r: Row) { return Service.create(r.id, { tenantId: r.tenant_id, name: r.name, category: r.category, durationMinutes: r.duration_minutes, basePriceCents: r.base_price_cents, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at }); }
  async findById(tenantId: string, id: string) { const r = await this.db.prepare('SELECT * FROM services WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first<Row>(); return r ? this.map(r) : null; }
  async list(tenantId: string, limit: number, cursor?: string) { const r = await this.db.prepare(cursor ? 'SELECT * FROM services WHERE tenant_id = ? AND id > ? ORDER BY id LIMIT ?' : 'SELECT * FROM services WHERE tenant_id = ? ORDER BY id LIMIT ?').bind(...(cursor ? [tenantId, cursor, limit] : [tenantId, limit])).all<Row>(); return r.results.map((row) => this.map(row)); }
  async create(s: Service) { const x = s.data; await this.db.prepare('INSERT INTO services (id, tenant_id, name, category, duration_minutes, base_price_cents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, x.tenantId, x.name, x.category, x.durationMinutes, x.basePriceCents, x.status, x.createdAt, x.updatedAt).run(); }
  async update(s: Service) { const x = s.data; await this.db.prepare('UPDATE services SET name = ?, category = ?, duration_minutes = ?, base_price_cents = ?, status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?').bind(x.name, x.category, x.durationMinutes, x.basePriceCents, x.status, x.updatedAt, x.tenantId, s.id).run(); }
}

import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
import {
  Professional,
  type ProfessionalProps,
} from '../domain/professional.js';
import type { ProfessionalRepository } from '../ports/professional-repository.js';
type Row = {
  id: string;
  tenant_id: string;
  name: string;
  specialty?: string;
  status: ProfessionalProps['status'];
  public_visible: number;
  created_at: string;
  updated_at: string;
};
export class D1ProfessionalRepository implements ProfessionalRepository {
  constructor(private readonly db: D1DatabaseLike) {}
  private map(r: Row) {
    return Professional.create(r.id, {
      tenantId: r.tenant_id,
      name: r.name,
      specialty: r.specialty ?? undefined,
      status: r.status,
      publicVisible: Boolean(r.public_visible),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }
  async findById(tenantId: string, id: string) {
    const r = await this.db
      .prepare('SELECT * FROM professionals WHERE tenant_id = ? AND id = ?')
      .bind(tenantId, id)
      .first<Row>();
    return r ? this.map(r) : null;
  }
  async list(tenantId: string, limit: number, cursor?: string) {
    const r = await this.db
      .prepare(
        cursor
          ? 'SELECT * FROM professionals WHERE tenant_id = ? AND id > ? ORDER BY id LIMIT ?'
          : 'SELECT * FROM professionals WHERE tenant_id = ? ORDER BY id LIMIT ?',
      )
      .bind(...(cursor ? [tenantId, cursor, limit] : [tenantId, limit]))
      .all<Row>();
    return r.results.map((row) => this.map(row));
  }
  async create(p: Professional, transaction?: TransactionalWriteContext) {
    const x = p.data;
    if (transaction) {
      transaction.add({
        kind: 'D1_SQL', expectedChanges: 1,
        sql: 'INSERT INTO professionals (id, tenant_id, name, status, public_visible, created_at, updated_at, specialty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        params: [p.id, x.tenantId, x.name, x.status, x.publicVisible ? 1 : 0, x.createdAt, x.updatedAt, x.specialty ?? null],
      });
      return;
    }
    await this.db
      .prepare(
        'INSERT INTO professionals (id, tenant_id, name, status, public_visible, created_at, updated_at, specialty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        p.id,
        x.tenantId,
        x.name,
        x.status,
        x.publicVisible ? 1 : 0,
        x.createdAt,
        x.updatedAt,
        x.specialty ?? null,
      )
      .run();
  }
  async update(p: Professional) {
    const x = p.data;
    await this.db
      .prepare(
        'UPDATE professionals SET name = ?, status = ?, public_visible = ?, updated_at = ? WHERE tenant_id = ? AND id = ?',
      )
      .bind(
        x.name,
        x.status,
        x.publicVisible ? 1 : 0,
        x.updatedAt,
        x.tenantId,
        p.id,
      )
      .run();
  }
}

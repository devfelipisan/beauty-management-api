import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
/// <reference types="@cloudflare/workers-types" />
import { Customer, type CustomerProps } from '../domain/customer.js';
import type { CustomerRepository } from '../ports/customer-repository.js';
type Row = {
  id: string;
  tenant_id: string;
  full_name: string;
  phone?: string;
  email?: string;
  document?: string;
  status: CustomerProps['status'];
  relationship_profile: CustomerProps['relationshipProfile'];
  blocked_for_new_appointments?: number;
  created_at: string;
  updated_at: string;
};
export class D1CustomerRepository implements CustomerRepository {
  constructor(private readonly db: D1Database) {}
  private async write(
    sql: string,
    params: unknown[],
    transaction?: TransactionalWriteContext,
  ) {
    if (transaction)
      transaction.add({ kind: 'D1_SQL', sql, params, expectedChanges: 1 });
    else
      await this.db
        .prepare(sql)
        .bind(...params)
        .run();
  }
  private map(r: Row) {
    return Customer.create(r.id, {
      tenantId: r.tenant_id,
      fullName: r.full_name,
      phone: r.phone,
      email: r.email,
      document: r.document,
      status: r.status,
      relationshipProfile: r.relationship_profile,
      blockedForNewAppointments: Boolean(r.blocked_for_new_appointments),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }
  async findById(tenantId: string, id: string) {
    const r = await this.db
      .prepare('SELECT * FROM customers WHERE tenant_id = ? AND id = ?')
      .bind(tenantId, id)
      .first<Row>();
    return r ? this.map(r) : null;
  }
  async findByPhone(tenantId: string, phone: string) {
    const r = await this.db
      .prepare('SELECT * FROM customers WHERE tenant_id = ? AND phone = ?')
      .bind(tenantId, phone)
      .first<Row>();
    return r ? this.map(r) : null;
  }
  async findByDocument(tenantId: string, document: string) {
    const r = await this.db
      .prepare('SELECT * FROM customers WHERE tenant_id = ? AND document = ?')
      .bind(tenantId, document.replace(/\D/g, ''))
      .first<Row>();
    return r ? this.map(r) : null;
  }
  async findByEmail(tenantId: string, email: string) {
    const r = await this.db
      .prepare('SELECT * FROM customers WHERE tenant_id = ? AND email = ?')
      .bind(tenantId, email)
      .first<Row>();
    return r ? this.map(r) : null;
  }
  async list(tenantId: string, limit: number, cursor?: string) {
    const r = await this.db
      .prepare(
        cursor
          ? 'SELECT * FROM customers WHERE tenant_id = ? AND id > ? ORDER BY id LIMIT ?'
          : 'SELECT * FROM customers WHERE tenant_id = ? ORDER BY id LIMIT ?',
      )
      .bind(...(cursor ? [tenantId, cursor, limit] : [tenantId, limit]))
      .all<Row>();
    return r.results.map((row) => this.map(row));
  }
  async create(c: Customer, transaction?: TransactionalWriteContext) {
    const x = c.data;
    await this.write(
      'INSERT INTO customers (id, tenant_id, full_name, phone, email, document, status, relationship_profile, blocked_for_new_appointments, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        c.id,
        x.tenantId,
        x.fullName,
        x.phone ?? null,
        x.email ?? null,
        x.document ?? null,
        x.status,
        x.relationshipProfile,
        x.blockedForNewAppointments ? 1 : 0,
        x.createdAt,
        x.updatedAt,
      ],
      transaction,
    );
  }
  async update(
    c: Customer,
    transaction?: TransactionalWriteContext,
    previousUpdatedAt?: string,
  ) {
    const x = c.data;
    await this.write(
      previousUpdatedAt === undefined
        ? 'UPDATE customers SET full_name = ?, phone = ?, email = ?, document = ?, status = ?, relationship_profile = ?, blocked_for_new_appointments = ?, updated_at = ? WHERE tenant_id = ? AND id = ?'
        : 'UPDATE customers SET full_name = ?, phone = ?, email = ?, document = ?, status = ?, relationship_profile = ?, blocked_for_new_appointments = ?, updated_at = ? WHERE tenant_id = ? AND id = ?' +
            ' AND updated_at = ?',
      [
        x.fullName,
        x.phone ?? null,
        x.email ?? null,
        x.document ?? null,
        x.status,
        x.relationshipProfile,
        x.blockedForNewAppointments ? 1 : 0,
        x.updatedAt,
        x.tenantId,
        c.id,
        ...(previousUpdatedAt === undefined ? [] : [previousUpdatedAt]),
      ],
      transaction,
    );
  }
}

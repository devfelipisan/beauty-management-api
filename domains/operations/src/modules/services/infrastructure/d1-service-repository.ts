import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import { Service, type ServiceProps } from '../domain/service.js';
import type { ServiceRepository } from '../ports/service-repository.js';
type Row = {
  id: string;
  tenant_id: string;
  name: string;
  category: string;
  duration_minutes: number;
  base_price_cents: number;
  status: ServiceProps['status'];
  requires_assessment?: number;
  allows_discount?: number;
  requires_equipment?: number;
  requires_photography?: number;
  has_technical_form?: number;
  technical_requirements_json?: string;
  minimum_price_cents?: number;
  deposit_mode?: ServiceProps['depositMode'];
  deposit_fixed_cents?: number;
  deposit_percentage_basis_points?: number;
  created_at: string;
  updated_at: string;
};
export class D1ServiceRepository implements ServiceRepository {
  constructor(private readonly db: D1DatabaseLike) {}
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
    return Service.create(r.id, {
      tenantId: r.tenant_id,
      name: r.name,
      category: r.category,
      durationMinutes: r.duration_minutes,
      basePriceCents: r.base_price_cents,
      status: r.status,
      requiresAssessment: Boolean(r.requires_assessment),
      allowsDiscount: Boolean(r.allows_discount),
      requiresEquipment: Boolean(r.requires_equipment),
      requiresPhotography: Boolean(r.requires_photography),
      hasTechnicalForm: Boolean(r.has_technical_form),
      technicalRequirements: r.technical_requirements_json
        ? JSON.parse(r.technical_requirements_json)
        : undefined,
      minimumPriceCents: r.minimum_price_cents ?? undefined,
      depositMode: r.deposit_mode ?? 'NOT_REQUIRED',
      depositFixedCents: r.deposit_fixed_cents ?? undefined,
      depositPercentageBasisPoints:
        r.deposit_percentage_basis_points ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }
  async findById(tenantId: string, id: string) {
    const r = await this.db
      .prepare('SELECT * FROM services WHERE tenant_id = ? AND id = ?')
      .bind(tenantId, id)
      .first<Row>();
    return r ? this.map(r) : null;
  }
  async list(tenantId: string, limit: number, cursor?: string) {
    const r = await this.db
      .prepare(
        cursor
          ? 'SELECT * FROM services WHERE tenant_id = ? AND id > ? ORDER BY id LIMIT ?'
          : 'SELECT * FROM services WHERE tenant_id = ? ORDER BY id LIMIT ?',
      )
      .bind(...(cursor ? [tenantId, cursor, limit] : [tenantId, limit]))
      .all<Row>();
    return r.results.map((row) => this.map(row));
  }
  async create(s: Service, transaction?: TransactionalWriteContext) {
    const x = s.data;
    await this.write(
      'INSERT INTO services (id, tenant_id, name, category, duration_minutes, base_price_cents, status, requires_assessment, allows_discount, requires_equipment, requires_photography, has_technical_form, technical_requirements_json, minimum_price_cents, deposit_mode, deposit_fixed_cents, deposit_percentage_basis_points, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        s.id,
        x.tenantId,
        x.name,
        x.category,
        x.durationMinutes,
        x.basePriceCents,
        x.status,
        x.requiresAssessment ? 1 : 0,
        x.allowsDiscount ? 1 : 0,
        x.requiresEquipment ? 1 : 0,
        x.requiresPhotography ? 1 : 0,
        x.hasTechnicalForm ? 1 : 0,
        x.technicalRequirements
          ? JSON.stringify(x.technicalRequirements)
          : null,
        x.minimumPriceCents ?? null,
        x.depositMode,
        x.depositFixedCents ?? null,
        x.depositPercentageBasisPoints ?? null,
        x.createdAt,
        x.updatedAt,
      ],
      transaction,
    );
  }
  async update(
    s: Service,
    transaction?: TransactionalWriteContext,
    previousUpdatedAt?: string,
  ) {
    const x = s.data;
    await this.write(
      previousUpdatedAt === undefined
        ? 'UPDATE services SET name = ?, category = ?, duration_minutes = ?, base_price_cents = ?, status = ?, requires_assessment = ?, allows_discount = ?, requires_equipment = ?, requires_photography = ?, has_technical_form = ?, technical_requirements_json = ?, minimum_price_cents = ?, deposit_mode = ?, deposit_fixed_cents = ?, deposit_percentage_basis_points = ?, updated_at = ? WHERE tenant_id = ? AND id = ?'
        : 'UPDATE services SET name = ?, category = ?, duration_minutes = ?, base_price_cents = ?, status = ?, requires_assessment = ?, allows_discount = ?, requires_equipment = ?, requires_photography = ?, has_technical_form = ?, technical_requirements_json = ?, minimum_price_cents = ?, deposit_mode = ?, deposit_fixed_cents = ?, deposit_percentage_basis_points = ?, updated_at = ? WHERE tenant_id = ? AND id = ?' +
            ' AND updated_at = ?',
      [
        x.name,
        x.category,
        x.durationMinutes,
        x.basePriceCents,
        x.status,
        x.requiresAssessment ? 1 : 0,
        x.allowsDiscount ? 1 : 0,
        x.requiresEquipment ? 1 : 0,
        x.requiresPhotography ? 1 : 0,
        x.hasTechnicalForm ? 1 : 0,
        x.technicalRequirements
          ? JSON.stringify(x.technicalRequirements)
          : null,
        x.minimumPriceCents ?? null,
        x.depositMode,
        x.depositFixedCents ?? null,
        x.depositPercentageBasisPoints ?? null,
        x.updatedAt,
        x.tenantId,
        s.id,
        ...(previousUpdatedAt === undefined ? [] : [previousUpdatedAt]),
      ],
      transaction,
    );
  }
  async getTechnicalContext(tenantId: string, serviceId: string) {
    const r = await this.db
      .prepare(
        'SELECT status, has_technical_form, requires_equipment, requires_photography, technical_requirements_json FROM services WHERE tenant_id = ? AND id = ?',
      )
      .bind(tenantId, serviceId)
      .first<{
        status: string;
        has_technical_form?: number;
        requires_equipment?: number;
        requires_photography?: number;
        technical_requirements_json?: string;
      }>();
    return r
      ? {
          tenantId,
          serviceId,
          active: r.status === 'ACTIVE',
          hasTechnicalForm: Boolean(r.has_technical_form),
          technicalRequirements: {
            requiresEquipment: Boolean(r.requires_equipment),
            requiresPhotography: Boolean(r.requires_photography),
            ...(r.technical_requirements_json
              ? JSON.parse(r.technical_requirements_json)
              : {}),
          },
        }
      : null;
  }
}

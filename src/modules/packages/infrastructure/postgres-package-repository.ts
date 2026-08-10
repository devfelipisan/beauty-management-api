import type { SqlExecutor } from "@/infrastructure/postgres/sql-client";
import type { CustomerPackage } from "../domain/package";
import type { PackageRepository } from "../domain/package-repository";

interface PackageRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  service_id: string;
  total_sessions: number;
  used_sessions: number;
  valid_until: unknown;
  status: CustomerPackage["status"];
  price_cents: unknown;
  created_at: unknown;
  updated_at: unknown;
}

const iso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);
const optionalIso = (value: unknown): string | undefined => value == null ? undefined : iso(value);

function mapPackage(row: PackageRow): CustomerPackage {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    serviceId: row.service_id,
    totalSessions: Number(row.total_sessions),
    usedSessions: Number(row.used_sessions),
    validUntil: optionalIso(row.valid_until),
    status: row.status,
    priceCents: row.price_cents == null ? undefined : Number(row.price_cents),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export class PostgresPackageRepository implements PackageRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<PackageRow>(
      "select * from app.customer_packages where tenant_id=$1 and id=$2",
      [tenantId, id],
    );
    return result.rows[0] ? mapPackage(result.rows[0]) : null;
  }

  async list(tenantId: string) {
    const result = await this.sql.query<PackageRow>(
      "select * from app.customer_packages where tenant_id=$1 order by created_at desc",
      [tenantId],
    );
    return result.rows.map(mapPackage);
  }

  async create(entity: CustomerPackage) {
    await this.sql.query(
      `insert into app.customer_packages (id,tenant_id,customer_id,service_id,total_sessions,used_sessions,valid_until,status,price_cents,created_at,updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [entity.id, entity.tenantId, entity.customerId, entity.serviceId, entity.totalSessions, entity.usedSessions, entity.validUntil ?? null, entity.status, entity.priceCents ?? null, entity.createdAt, entity.updatedAt],
    );
    return entity;
  }

  async update(entity: CustomerPackage) {
    await this.sql.query(
      `update app.customer_packages set total_sessions=$3,used_sessions=$4,valid_until=$5,status=$6,price_cents=$7,updated_at=$8
       where tenant_id=$1 and id=$2`,
      [entity.tenantId, entity.id, entity.totalSessions, entity.usedSessions, entity.validUntil ?? null, entity.status, entity.priceCents ?? null, entity.updatedAt],
    );
    return entity;
  }
}

import type { SqlExecutor } from "@/infrastructure/postgres/sql-client";
import type { Equipment } from "../domain/equipment";
import type { EquipmentRepository } from "../domain/equipment-repository";

interface EquipmentRow {
  id: string;
  tenant_id: string;
  name: string;
  model: string | null;
  manufacturer: string | null;
  serial_number: string | null;
  primary_unit: string | null;
  status: Equipment["status"];
  notes: string | null;
  last_used_at: unknown;
  usage_count: number;
  created_at: unknown;
  updated_at: unknown;
  service_ids: unknown;
}

const optionalString = (value: unknown): string | undefined => value == null ? undefined : String(value);
const iso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);
const optionalIso = (value: unknown): string | undefined => value == null ? undefined : iso(value);
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

const selectEquipment = `select e.id,e.tenant_id,e.name,e.model,e.manufacturer,e.serial_number,e.primary_unit,e.status,e.notes,e.last_used_at,e.usage_count,e.created_at,e.updated_at,
  coalesce(array_agg(es.service_id) filter (where es.service_id is not null), '{}') as service_ids
  from app.equipment e
  left join app.equipment_services es on es.tenant_id=e.tenant_id and es.equipment_id=e.id`;

function mapEquipment(row: EquipmentRow): Equipment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    model: optionalString(row.model),
    manufacturer: optionalString(row.manufacturer),
    serialNumber: optionalString(row.serial_number),
    primaryUnit: optionalString(row.primary_unit),
    serviceIds: stringArray(row.service_ids),
    status: row.status,
    notes: optionalString(row.notes),
    lastUsedAt: optionalIso(row.last_used_at),
    usageCount: Number(row.usage_count),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export class PostgresEquipmentRepository implements EquipmentRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<EquipmentRow>(
      `${selectEquipment} where e.tenant_id=$1 and e.id=$2 group by e.id,e.tenant_id,e.name,e.model,e.manufacturer,e.serial_number,e.primary_unit,e.status,e.notes,e.last_used_at,e.usage_count,e.created_at,e.updated_at`,
      [tenantId, id],
    );
    return result.rows[0] ? mapEquipment(result.rows[0]) : null;
  }

  async list(tenantId: string) {
    const result = await this.sql.query<EquipmentRow>(
      `${selectEquipment} where e.tenant_id=$1 group by e.id,e.tenant_id,e.name,e.model,e.manufacturer,e.serial_number,e.primary_unit,e.status,e.notes,e.last_used_at,e.usage_count,e.created_at,e.updated_at order by e.name`,
      [tenantId],
    );
    return result.rows.map(mapEquipment);
  }

  async create(entity: Equipment) {
    await this.sql.query(
      `insert into app.equipment (id,tenant_id,name,model,manufacturer,serial_number,primary_unit,status,notes,last_used_at,usage_count,created_at,updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [entity.id, entity.tenantId, entity.name, entity.model ?? null, entity.manufacturer ?? null, entity.serialNumber ?? null, entity.primaryUnit ?? null, entity.status, entity.notes ?? null, entity.lastUsedAt ?? null, entity.usageCount, entity.createdAt, entity.updatedAt],
    );
    for (const serviceId of entity.serviceIds) {
      await this.sql.query(
        "insert into app.equipment_services (tenant_id,equipment_id,service_id) values ($1,$2,$3) on conflict do nothing",
        [entity.tenantId, entity.id, serviceId],
      );
    }
    return entity;
  }

  async update(entity: Equipment) {
    await this.sql.query(
      `update app.equipment set name=$3,model=$4,manufacturer=$5,serial_number=$6,primary_unit=$7,status=$8,notes=$9,last_used_at=$10,usage_count=$11,updated_at=$12
       where tenant_id=$1 and id=$2`,
      [entity.tenantId, entity.id, entity.name, entity.model ?? null, entity.manufacturer ?? null, entity.serialNumber ?? null, entity.primaryUnit ?? null, entity.status, entity.notes ?? null, entity.lastUsedAt ?? null, entity.usageCount, entity.updatedAt],
    );
    await this.sql.query("delete from app.equipment_services where tenant_id=$1 and equipment_id=$2", [entity.tenantId, entity.id]);
    for (const serviceId of entity.serviceIds) {
      await this.sql.query(
        "insert into app.equipment_services (tenant_id,equipment_id,service_id) values ($1,$2,$3) on conflict do nothing",
        [entity.tenantId, entity.id, serviceId],
      );
    }
    return entity;
  }
}

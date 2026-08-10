import type { Assessment, AssessmentResult } from "@/modules/assessments/domain/assessment";
import type { AssessmentRepository } from "@/modules/assessments/domain/assessment-repository";
import type { FollowUp, FollowUpStatus } from "@/modules/follow-ups/domain/follow-up";
import type { FollowUpRepository } from "@/modules/follow-ups/domain/follow-up-repository";
import type { TechnicalRecord } from "@/modules/technical-records/domain/technical-record";
import type { TechnicalRecordRepository } from "@/modules/technical-records/domain/technical-record-repository";
import type { SqlExecutor } from "./sql-client";

const asIso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);
const optional = (value: unknown): string | undefined => value == null ? undefined : String(value);

interface AssessmentRow {
  id: string; tenant_id: string; customer_id: string; service_id: string; professional_id: string;
  result: AssessmentResult; restrictions: string[] | null; valid_until: unknown | null; created_at: unknown;
}
const mapAssessment = (row: AssessmentRow): Assessment => ({
  id: row.id, tenantId: row.tenant_id, customerId: row.customer_id, serviceId: row.service_id, professionalId: row.professional_id,
  result: row.result, restrictions: row.restrictions ?? [], validUntil: row.valid_until == null ? undefined : asIso(row.valid_until), createdAt: asIso(row.created_at),
});

export class PostgresAssessmentRepository implements AssessmentRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<AssessmentRow>("select * from app.assessments where tenant_id=$1 and id=$2", [tenantId, id]);
    return result.rows[0] ? mapAssessment(result.rows[0]) : null;
  }
  async listByCustomer(tenantId: string, customerId: string) {
    const result = await this.sql.query<AssessmentRow>("select * from app.assessments where tenant_id=$1 and customer_id=$2 order by created_at desc", [tenantId, customerId]);
    return result.rows.map(mapAssessment);
  }
  async create(entity: Assessment) {
    await this.sql.query(
      "insert into app.assessments (id,tenant_id,customer_id,service_id,professional_id,result,restrictions,valid_until,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [entity.id, entity.tenantId, entity.customerId, entity.serviceId, entity.professionalId, entity.result, entity.restrictions, entity.validUntil ?? null, entity.createdAt],
    );
    return entity;
  }
}

interface TechnicalRecordRow {
  id: string; tenant_id: string; session_id: string; region: string | null; equipment_id: string | null; power: number | null;
  power_unit: string | null; reaction: string | null; notes: string | null; created_at: unknown;
}
const mapTechnicalRecord = (row: TechnicalRecordRow): TechnicalRecord => ({
  id: row.id, tenantId: row.tenant_id, sessionId: row.session_id, region: optional(row.region), equipmentId: optional(row.equipment_id),
  power: row.power == null ? undefined : Number(row.power), powerUnit: optional(row.power_unit), reaction: optional(row.reaction), notes: optional(row.notes), createdAt: asIso(row.created_at),
});

export class PostgresTechnicalRecordRepository implements TechnicalRecordRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<TechnicalRecordRow>("select * from app.technical_records where tenant_id=$1 and id=$2", [tenantId, id]);
    return result.rows[0] ? mapTechnicalRecord(result.rows[0]) : null;
  }
  async listBySession(tenantId: string, sessionId: string) {
    const result = await this.sql.query<TechnicalRecordRow>("select * from app.technical_records where tenant_id=$1 and session_id=$2 order by created_at", [tenantId, sessionId]);
    return result.rows.map(mapTechnicalRecord);
  }
  async create(entity: TechnicalRecord) {
    await this.sql.query(
      "insert into app.technical_records (id,tenant_id,session_id,region,equipment_id,power,power_unit,reaction,notes,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [entity.id, entity.tenantId, entity.sessionId, entity.region ?? null, entity.equipmentId ?? null, entity.power ?? null, entity.powerUnit ?? null, entity.reaction ?? null, entity.notes ?? null, entity.createdAt],
    );
    return entity;
  }
}

interface FollowUpRow {
  id: string; tenant_id: string; customer_id: string; session_id: string | null; suggested_at: unknown; reason: string | null;
  appointment_id: string | null; status: FollowUpStatus; created_at: unknown; updated_at: unknown;
}
const mapFollowUp = (row: FollowUpRow): FollowUp => ({
  id: row.id, tenantId: row.tenant_id, customerId: row.customer_id, sessionId: optional(row.session_id), suggestedAt: asIso(row.suggested_at),
  reason: optional(row.reason), appointmentId: optional(row.appointment_id), status: row.status, createdAt: asIso(row.created_at), updatedAt: asIso(row.updated_at),
});

export class PostgresFollowUpRepository implements FollowUpRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<FollowUpRow>("select * from app.follow_ups where tenant_id=$1 and id=$2", [tenantId, id]);
    return result.rows[0] ? mapFollowUp(result.rows[0]) : null;
  }
  async list(tenantId: string) {
    const result = await this.sql.query<FollowUpRow>("select * from app.follow_ups where tenant_id=$1 order by suggested_at", [tenantId]);
    return result.rows.map(mapFollowUp);
  }
  async create(entity: FollowUp) {
    await this.sql.query(
      "insert into app.follow_ups (id,tenant_id,customer_id,session_id,suggested_at,reason,appointment_id,status,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [entity.id, entity.tenantId, entity.customerId, entity.sessionId ?? null, entity.suggestedAt, entity.reason ?? null, entity.appointmentId ?? null, entity.status, entity.createdAt, entity.updatedAt],
    );
    return entity;
  }
  async update(entity: FollowUp) {
    await this.sql.query("update app.follow_ups set suggested_at=$3,reason=$4,appointment_id=$5,status=$6,updated_at=$7 where tenant_id=$1 and id=$2", [entity.tenantId, entity.id, entity.suggestedAt, entity.reason ?? null, entity.appointmentId ?? null, entity.status, entity.updatedAt]);
    return entity;
  }
}

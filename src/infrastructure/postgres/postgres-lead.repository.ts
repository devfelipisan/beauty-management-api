import type { Lead } from "@/modules/leads/domain/lead";
import type { LeadRepository } from "@/modules/leads/domain/lead-repository";
import type { SqlExecutor } from "./sql-client";

const asIso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);
const optional = (value: unknown): string | undefined => value == null ? undefined : String(value);

type LeadRow = {
  id: string;
  tenant_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  service_id: string | null;
  professional_id: string | null;
  desired_period: string | null;
  notes: string | null;
  origin: Lead["origin"];
  privacy_consent_at: unknown | null;
  marketing_consent_at: unknown | null;
  status: Lead["status"];
  customer_id: string | null;
  appointment_id: string | null;
  created_at: unknown;
  updated_at: unknown;
};

function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    fullName: row.full_name,
    phone: optional(row.phone),
    email: optional(row.email),
    serviceId: optional(row.service_id),
    professionalId: optional(row.professional_id),
    desiredPeriod: optional(row.desired_period),
    notes: optional(row.notes),
    origin: row.origin,
    privacyConsentAt: row.privacy_consent_at == null ? undefined : asIso(row.privacy_consent_at),
    marketingConsentAt: row.marketing_consent_at == null ? undefined : asIso(row.marketing_consent_at),
    status: row.status,
    customerId: optional(row.customer_id),
    appointmentId: optional(row.appointment_id),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

const columns = `id, tenant_id, full_name, phone, email, service_id, professional_id, desired_period, notes, origin,
  privacy_consent_at, marketing_consent_at, status, customer_id, appointment_id, created_at, updated_at`;

export class PostgresLeadRepository implements LeadRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(tenantId: string, id: string): Promise<Lead | null> {
    const result = await this.sql.query<LeadRow>(`select ${columns} from app.leads where tenant_id=$1 and id=$2`, [tenantId, id]);
    return result.rows[0] ? mapLead(result.rows[0]) : null;
  }

  async findPotentialDuplicates(tenantId: string, input: Pick<Lead, "phone" | "email">): Promise<Lead[]> {
    const result = await this.sql.query<LeadRow>(
      `select ${columns} from app.leads where tenant_id=$1 and (($2::text is not null and phone=$2) or ($3::text is not null and lower(email)=lower($3))) order by created_at desc`,
      [tenantId, input.phone ?? null, input.email ?? null],
    );
    return result.rows.map(mapLead);
  }

  async list(tenantId: string): Promise<Lead[]> {
    const result = await this.sql.query<LeadRow>(`select ${columns} from app.leads where tenant_id=$1 order by created_at desc`, [tenantId]);
    return result.rows.map(mapLead);
  }

  async create(entity: Lead): Promise<Lead> {
    await this.sql.query(
      `insert into app.leads (id, tenant_id, full_name, phone, email, service_id, professional_id, desired_period, notes, origin, privacy_consent_at, marketing_consent_at, status, customer_id, appointment_id, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [entity.id, entity.tenantId, entity.fullName, entity.phone ?? null, entity.email ?? null, entity.serviceId ?? null, entity.professionalId ?? null, entity.desiredPeriod ?? null, entity.notes ?? null, entity.origin, entity.privacyConsentAt ?? null, entity.marketingConsentAt ?? null, entity.status, entity.customerId ?? null, entity.appointmentId ?? null, entity.createdAt, entity.updatedAt],
    );
    return entity;
  }

  async update(entity: Lead): Promise<Lead> {
    await this.sql.query(
      `update app.leads set full_name=$3, phone=$4, email=$5, service_id=$6, professional_id=$7, desired_period=$8, notes=$9, origin=$10, privacy_consent_at=$11, marketing_consent_at=$12, status=$13, customer_id=$14, appointment_id=$15, updated_at=$16 where tenant_id=$1 and id=$2`,
      [entity.tenantId, entity.id, entity.fullName, entity.phone ?? null, entity.email ?? null, entity.serviceId ?? null, entity.professionalId ?? null, entity.desiredPeriod ?? null, entity.notes ?? null, entity.origin, entity.privacyConsentAt ?? null, entity.marketingConsentAt ?? null, entity.status, entity.customerId ?? null, entity.appointmentId ?? null, entity.updatedAt],
    );
    return entity;
  }
}

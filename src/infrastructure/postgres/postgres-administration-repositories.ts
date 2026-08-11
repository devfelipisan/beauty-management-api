import type { CommercialPolicyRepository } from "@/modules/commercial-policy/domain/commercial-policy-repository";
import type { DiscountApproval, DiscountApprovalStatus, DiscountPolicy, DiscountPolicyStatus, DiscountPolicyType, RelationshipProfileConfig } from "@/modules/commercial-policy/domain/commercial-policy";
import type { TenantUser, UserProfile, UserStatus } from "@/modules/users/domain/user";
import type { TenantUserRepository } from "@/modules/users/domain/user-repository";
import type { CustomerProfile } from "@/shared/domain/models";
import type { SqlExecutor } from "./sql-client";

const asIso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);
const optional = (value: unknown): string | undefined => value == null ? undefined : String(value);
const optionalNumber = (value: unknown): number | undefined => value == null ? undefined : Number(value);
const optionalArray = (value: unknown): string[] | undefined => Array.isArray(value) ? value.map(String) : undefined;

type UserRow = {
  id: string; tenant_id: string; full_name: string; email: string; phone: string | null; profile: UserProfile; status: UserStatus;
  last_access_at: unknown | null; created_at: unknown; updated_at: unknown;
};
const mapUser = (row: UserRow): TenantUser => ({
  id: row.id, tenantId: row.tenant_id, fullName: row.full_name, email: row.email, phone: optional(row.phone), profile: row.profile,
  status: row.status, lastAccessAt: row.last_access_at == null ? undefined : asIso(row.last_access_at), createdAt: asIso(row.created_at), updatedAt: asIso(row.updated_at),
});

export class PostgresTenantUserRepository implements TenantUserRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<UserRow>("select * from app.tenant_users where tenant_id=$1 and id=$2", [tenantId, id]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }
  async findByEmail(tenantId: string, email: string) {
    const result = await this.sql.query<UserRow>("select * from app.tenant_users where tenant_id=$1 and lower(email)=lower($2)", [tenantId, email.trim()]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }
  async list(tenantId: string) {
    const result = await this.sql.query<UserRow>("select * from app.tenant_users where tenant_id=$1 order by full_name", [tenantId]);
    return result.rows.map(mapUser);
  }
  async create(entity: TenantUser) {
    await this.sql.query("insert into app.tenant_users (id,tenant_id,full_name,email,phone,profile,status,last_access_at,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [entity.id,entity.tenantId,entity.fullName,entity.email,entity.phone??null,entity.profile,entity.status,entity.lastAccessAt??null,entity.createdAt,entity.updatedAt]);
    return entity;
  }
  async update(entity: TenantUser) {
    await this.sql.query("update app.tenant_users set full_name=$3,phone=$4,profile=$5,status=$6,last_access_at=$7,updated_at=$8 where tenant_id=$1 and id=$2",
      [entity.tenantId,entity.id,entity.fullName,entity.phone??null,entity.profile,entity.status,entity.lastAccessAt??null,entity.updatedAt]);
    return entity;
  }
}

type ConfigRow = {
  profile: CustomerProfile; minimum_completed_appointments: number | null; period_months: number | null; maximum_no_shows: number | null;
  inactive_after_days: number | null; manual_override_allowed: boolean; updated_at: unknown;
};
type PolicyRow = {
  id:string; tenant_id:string; name:string; profile:CustomerProfile; type:DiscountPolicyType; status:DiscountPolicyStatus; percentage:unknown|null;
  fixed_amount_cents:unknown|null; eligible_service_ids:unknown; eligible_categories:unknown; eligible_package_ids:unknown; minimum_amount_cents:unknown|null;
  maximum_discount_cents:unknown|null; valid_from:unknown|null; valid_until:unknown|null; single_use:boolean; requires_approval:boolean; stackable:boolean;
  created_at:unknown; updated_at:unknown;
};
type ApprovalRow = {
  id:string; tenant_id:string; customer_id:string; operation_type:DiscountApproval["operationType"]; operation_id:string|null; requested_by:string;
  requested_percentage:unknown|null; requested_amount_cents:unknown|null; justification:string; status:DiscountApprovalStatus; decided_by:string|null;
  decided_at:unknown|null; created_at:unknown;
};

const mapPolicy = (row: PolicyRow): DiscountPolicy => ({
  id:row.id,tenantId:row.tenant_id,name:row.name,profile:row.profile,type:row.type,status:row.status,percentage:optionalNumber(row.percentage),
  fixedAmountCents:optionalNumber(row.fixed_amount_cents),eligibleServiceIds:optionalArray(row.eligible_service_ids),eligibleCategories:optionalArray(row.eligible_categories),
  eligiblePackageIds:optionalArray(row.eligible_package_ids),minimumAmountCents:optionalNumber(row.minimum_amount_cents),maximumDiscountCents:optionalNumber(row.maximum_discount_cents),
  validFrom:row.valid_from==null?undefined:asIso(row.valid_from),validUntil:row.valid_until==null?undefined:asIso(row.valid_until),singleUse:row.single_use,
  requiresApproval:row.requires_approval,stackable:row.stackable,createdAt:asIso(row.created_at),updatedAt:asIso(row.updated_at),
});

export class PostgresCommercialPolicyRepository implements CommercialPolicyRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async listRelationshipProfileConfigs(tenantId: string): Promise<RelationshipProfileConfig[]> {
    const result = await this.sql.query<ConfigRow>("select * from app.relationship_profile_configs where tenant_id=$1 order by profile", [tenantId]);
    return result.rows.map((r) => ({ profile:r.profile, minimumCompletedAppointments:optionalNumber(r.minimum_completed_appointments), periodMonths:optionalNumber(r.period_months),
      maximumNoShows:optionalNumber(r.maximum_no_shows), inactiveAfterDays:optionalNumber(r.inactive_after_days), manualOverrideAllowed:r.manual_override_allowed, updatedAt:asIso(r.updated_at) }));
  }
  async listDiscountPolicies(tenantId: string) {
    const result = await this.sql.query<PolicyRow>("select * from app.discount_policies where tenant_id=$1 order by created_at desc", [tenantId]);
    return result.rows.map(mapPolicy);
  }
  async listDiscountApprovals(tenantId: string): Promise<DiscountApproval[]> {
    const result = await this.sql.query<ApprovalRow>("select * from app.discount_approvals where tenant_id=$1 order by created_at desc", [tenantId]);
    return result.rows.map((r) => ({ id:r.id,tenantId:r.tenant_id,customerId:r.customer_id,operationType:r.operation_type,operationId:optional(r.operation_id),
      requestedBy:r.requested_by,requestedPercentage:optionalNumber(r.requested_percentage),requestedAmountCents:optionalNumber(r.requested_amount_cents),justification:r.justification,
      status:r.status,decidedBy:optional(r.decided_by),decidedAt:r.decided_at==null?undefined:asIso(r.decided_at),createdAt:asIso(r.created_at) }));
  }
  async createDiscountPolicy(p: DiscountPolicy) {
    await this.sql.query(`insert into app.discount_policies (id,tenant_id,name,profile,type,status,percentage,fixed_amount_cents,eligible_service_ids,eligible_categories,
      eligible_package_ids,minimum_amount_cents,maximum_discount_cents,valid_from,valid_until,single_use,requires_approval,stackable,created_at,updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [p.id,p.tenantId,p.name,p.profile,p.type,p.status,p.percentage??null,p.fixedAmountCents??null,p.eligibleServiceIds??null,p.eligibleCategories??null,
       p.eligiblePackageIds??null,p.minimumAmountCents??null,p.maximumDiscountCents??null,p.validFrom??null,p.validUntil??null,p.singleUse,p.requiresApproval,p.stackable,p.createdAt,p.updatedAt]);
    return p;
  }
}

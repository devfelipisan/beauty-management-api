import type { LeadConversionTransaction, LeadConversionUnitOfWork } from "@/modules/leads/application/lead-conversion-unit-of-work";
import type { Lead } from "@/modules/leads/domain/lead";
import type { ExecutionContext } from "@/shared/application/execution-context";
import { ConflictError, NotFoundError } from "@/shared/domain/core";
import type { Customer } from "@/shared/domain/models";
import type { SqlClient, SqlExecutor } from "./sql-client";

const asIso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);
const optional = (value: unknown): string | undefined => value == null ? undefined : String(value);
function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  return typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
}

type LeadRow = { id:string; tenant_id:string; full_name:string; phone:string|null; email:string|null; service_id:string|null; professional_id:string|null; desired_period:string|null; notes:string|null; origin:Lead["origin"]; privacy_consent_at:unknown|null; marketing_consent_at:unknown|null; status:Lead["status"]; customer_id:string|null; appointment_id:string|null; created_at:unknown; updated_at:unknown };
type CustomerRow = { id:string; tenant_id:string; full_name:string; phone:string; email:string|null; status:Customer["status"]; relationship_profile:Customer["relationshipProfile"]; created_at:unknown; updated_at:unknown };

const mapLead = (row: LeadRow): Lead => ({ id:row.id, tenantId:row.tenant_id, fullName:row.full_name, phone:optional(row.phone), email:optional(row.email), serviceId:optional(row.service_id), professionalId:optional(row.professional_id), desiredPeriod:optional(row.desired_period), notes:optional(row.notes), origin:row.origin, privacyConsentAt:row.privacy_consent_at==null?undefined:asIso(row.privacy_consent_at), marketingConsentAt:row.marketing_consent_at==null?undefined:asIso(row.marketing_consent_at), status:row.status, customerId:optional(row.customer_id), appointmentId:optional(row.appointment_id), createdAt:asIso(row.created_at), updatedAt:asIso(row.updated_at) });
const mapCustomer = (row: CustomerRow): Customer => ({ id:row.id, tenantId:row.tenant_id, fullName:row.full_name, phone:row.phone, email:optional(row.email), status:row.status, relationshipProfile:row.relationship_profile, createdAt:asIso(row.created_at), updatedAt:asIso(row.updated_at) });

class PostgresLeadConversionTransaction implements LeadConversionTransaction {
  constructor(private readonly sql: SqlExecutor) {}
  async findLeadById(tenantId:string, leadId:string) { const r=await this.sql.query<LeadRow>("select * from app.leads where tenant_id=$1 and id=$2 for update",[tenantId,leadId]); return r.rows[0]?mapLead(r.rows[0]):null; }
  async findCustomerById(tenantId:string, customerId:string) { const r=await this.sql.query<CustomerRow>("select * from app.customers where tenant_id=$1 and id=$2",[tenantId,customerId]); return r.rows[0]?mapCustomer(r.rows[0]):null; }
  async findCustomerDuplicates(tenantId:string,input:Pick<Customer,"fullName"|"phone"|"email">) { const r=await this.sql.query<CustomerRow>("select * from app.customers where tenant_id=$1 and (phone=$2 or ($3::text is not null and lower(email)=lower($3)) or lower(full_name)=lower($4))",[tenantId,input.phone,input.email??null,input.fullName]); return r.rows.map(mapCustomer); }
  async createCustomer(customer:Customer) { try { await this.sql.query("insert into app.customers (id,tenant_id,full_name,phone,email,status,relationship_profile,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",[customer.id,customer.tenantId,customer.fullName,customer.phone,customer.email??null,customer.status,customer.relationshipProfile,customer.createdAt,customer.updatedAt]); return customer; } catch(error) { if(postgresCode(error)==="23505") throw new ConflictError("CUSTOMER_DUPLICATE","A customer with the same phone or e-mail already exists."); throw error; } }
  async updateLead(lead:Lead) { const r=await this.sql.query("update app.leads set full_name=$3,phone=$4,email=$5,service_id=$6,professional_id=$7,desired_period=$8,notes=$9,origin=$10,privacy_consent_at=$11,marketing_consent_at=$12,status=$13,customer_id=$14,appointment_id=$15,updated_at=$16 where tenant_id=$1 and id=$2",[lead.tenantId,lead.id,lead.fullName,lead.phone??null,lead.email??null,lead.serviceId??null,lead.professionalId??null,lead.desiredPeriod??null,lead.notes??null,lead.origin,lead.privacyConsentAt??null,lead.marketingConsentAt??null,lead.status,lead.customerId??null,lead.appointmentId??null,lead.updatedAt]); if(r.rowCount===0) throw new NotFoundError("lead",lead.id); return lead; }
}

export class PostgresLeadConversionUnitOfWork implements LeadConversionUnitOfWork {
  constructor(private readonly sql: SqlClient) {}
  execute<T>(context: ExecutionContext, work: (transaction: LeadConversionTransaction) => Promise<T>): Promise<T> {
    return this.sql.transaction(async (transaction) => {
      await transaction.query("select set_config('app.tenant_id',$1,true), set_config('app.actor_id',$2,true)",[context.tenantId??"",context.actorId??""]);
      return work(new PostgresLeadConversionTransaction(transaction));
    });
  }
}

import type { TenantBranding } from "@/modules/tenant-branding/domain/tenant-branding";
import type { ExecutionContext } from "@/shared/application/execution-context";
import type {
  AppointmentRepository,
  CustomerRepository,
  DepositRepository,
  PaymentRepository,
  ProfessionalRepository,
  ServiceRepository,
  SessionRepository,
  TenantBrandingRepository,
  TenantRepository,
  TransactionContext,
  UnitOfWork,
} from "@/shared/application/ports";
import type { AuditEvent, AuditQuery } from "@/shared/audit/audit";
import { ConflictError } from "@/shared/domain/core";
import type { Appointment, Customer, Deposit, Payment, Professional, Service, Session, Tenant } from "@/shared/domain/models";
import type { IdempotencyRecord } from "@/shared/idempotency/idempotency";
import type { OutboxEvent } from "@/shared/outbox/outbox";
import type { SqlClient, SqlExecutor } from "./sql-client";

const asNumber = (value: unknown): number => typeof value === "number" ? value : Number(value);
const asIso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);
const asOptionalIso = (value: unknown): string | undefined => value == null ? undefined : asIso(value);
const asOptionalString = (value: unknown): string | undefined => value == null ? undefined : String(value);
const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  return typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
}

function postgresConstraint(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  return typeof (error as { constraint?: unknown }).constraint === "string" ? (error as { constraint: string }).constraint : undefined;
}

async function setTenantContext(executor: SqlExecutor, tenantId?: string, actorId?: string): Promise<void> {
  await executor.query(
    "select set_config('app.tenant_id', $1, true), set_config('app.actor_id', $2, true)",
    [tenantId ?? "", actorId ?? ""],
  );
}

type TenantRow = {
  id: string;
  legal_name: string;
  display_name: string;
  document: string;
  timezone: string;
  status: Tenant["status"];
  created_at: unknown;
};
const mapTenant = (row: TenantRow): Tenant => ({
  id: row.id,
  legalName: row.legal_name,
  displayName: row.display_name,
  document: row.document,
  timezone: row.timezone,
  status: row.status,
  createdAt: asIso(row.created_at),
});

class PostgresTenantRepository implements TenantRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(id: string) {
    const result = await this.sql.query<TenantRow>(
      "select id, legal_name, display_name, document, timezone, status, created_at from app.tenants where id = $1",
      [id],
    );
    return result.rows[0] ? mapTenant(result.rows[0]) : null;
  }

  async findByDocument(document: string) {
    const result = await this.sql.query<TenantRow>(
      "select id, legal_name, display_name, document, timezone, status, created_at from app.tenants where document = $1",
      [document],
    );
    return result.rows[0] ? mapTenant(result.rows[0]) : null;
  }

  async list() {
    const result = await this.sql.query<TenantRow>(
      "select id, legal_name, display_name, document, timezone, status, created_at from app.tenants order by created_at desc",
    );
    return result.rows.map(mapTenant);
  }

  async create(entity: Tenant) {
    try {
      await this.sql.query(
        "insert into app.tenants (id, legal_name, display_name, document, timezone, status, created_at) values ($1,$2,$3,$4,$5,$6,$7)",
        [entity.id, entity.legalName, entity.displayName, entity.document, entity.timezone, entity.status, entity.createdAt],
      );
      return entity;
    } catch (error) {
      if (postgresCode(error) === "23505") {
        throw new ConflictError("TENANT_DOCUMENT_DUPLICATE", "A tenant with this document already exists.");
      }
      throw error;
    }
  }
}

type BrandingRow = {
  tenant_id: string;
  primary_color: string | null;
  secondary_color: string | null;
  logo_file_id: string | null;
  favicon_file_id: string | null;
  hero_file_id: string | null;
  updated_at: unknown;
};
const mapBranding = (row: BrandingRow): TenantBranding => ({
  tenantId: row.tenant_id,
  primaryColor: asOptionalString(row.primary_color),
  secondaryColor: asOptionalString(row.secondary_color),
  logoFileId: asOptionalString(row.logo_file_id),
  faviconFileId: asOptionalString(row.favicon_file_id),
  heroFileId: asOptionalString(row.hero_file_id),
  updatedAt: asIso(row.updated_at),
});

class PostgresTenantBrandingRepository implements TenantBrandingRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findByTenantId(tenantId: string) {
    const result = await this.sql.query<BrandingRow>(
      "select tenant_id, primary_color, secondary_color, logo_file_id, favicon_file_id, hero_file_id, updated_at from app.tenant_brandings where tenant_id = $1",
      [tenantId],
    );
    return result.rows[0] ? mapBranding(result.rows[0]) : null;
  }

  async save(entity: TenantBranding) {
    await this.sql.query(
      `insert into app.tenant_brandings (tenant_id, primary_color, secondary_color, logo_file_id, favicon_file_id, hero_file_id, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (tenant_id) do update set
         primary_color=excluded.primary_color,
         secondary_color=excluded.secondary_color,
         logo_file_id=excluded.logo_file_id,
         favicon_file_id=excluded.favicon_file_id,
         hero_file_id=excluded.hero_file_id,
         updated_at=excluded.updated_at`,
      [entity.tenantId, entity.primaryColor ?? null, entity.secondaryColor ?? null, entity.logoFileId ?? null, entity.faviconFileId ?? null, entity.heroFileId ?? null, entity.updatedAt],
    );
    return entity;
  }
}

type ProfessionalRow = {
  id: string;
  tenant_id: string;
  display_name: string;
  specialty: string | null;
  active: boolean;
  created_at: unknown;
  service_ids: unknown;
};
const mapProfessional = (row: ProfessionalRow): Professional => ({
  id: row.id,
  tenantId: row.tenant_id,
  displayName: row.display_name,
  specialty: asOptionalString(row.specialty),
  serviceIds: asStringArray(row.service_ids),
  active: row.active,
  createdAt: asIso(row.created_at),
});
const professionalSelect = `select p.id, p.tenant_id, p.display_name, p.specialty, p.active, p.created_at,
  coalesce(array_agg(ps.service_id) filter (where ps.service_id is not null), '{}') as service_ids
  from app.professionals p
  left join app.professional_services ps on ps.tenant_id=p.tenant_id and ps.professional_id=p.id`;

class PostgresProfessionalRepository implements ProfessionalRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<ProfessionalRow>(
      `${professionalSelect} where p.tenant_id=$1 and p.id=$2 group by p.id,p.tenant_id,p.display_name,p.specialty,p.active,p.created_at`,
      [tenantId, id],
    );
    return result.rows[0] ? mapProfessional(result.rows[0]) : null;
  }

  async list(tenantId: string) {
    const result = await this.sql.query<ProfessionalRow>(
      `${professionalSelect} where p.tenant_id=$1 group by p.id,p.tenant_id,p.display_name,p.specialty,p.active,p.created_at order by p.display_name`,
      [tenantId],
    );
    return result.rows.map(mapProfessional);
  }

  async create(entity: Professional) {
    await this.sql.query(
      "insert into app.professionals (id,tenant_id,display_name,specialty,active,created_at) values ($1,$2,$3,$4,$5,$6)",
      [entity.id, entity.tenantId, entity.displayName, entity.specialty ?? null, entity.active, entity.createdAt],
    );
    for (const serviceId of entity.serviceIds) {
      await this.sql.query(
        "insert into app.professional_services (tenant_id,professional_id,service_id) values ($1,$2,$3) on conflict do nothing",
        [entity.tenantId, entity.id, serviceId],
      );
    }
    return entity;
  }

  async update(entity: Professional) {
    await this.sql.query(
      "update app.professionals set display_name=$3,specialty=$4,active=$5 where tenant_id=$1 and id=$2",
      [entity.tenantId, entity.id, entity.displayName, entity.specialty ?? null, entity.active],
    );
    await this.sql.query(
      "delete from app.professional_services where tenant_id=$1 and professional_id=$2",
      [entity.tenantId, entity.id],
    );
    for (const serviceId of entity.serviceIds) {
      await this.sql.query(
        "insert into app.professional_services (tenant_id,professional_id,service_id) values ($1,$2,$3) on conflict do nothing",
        [entity.tenantId, entity.id, serviceId],
      );
    }
    return entity;
  }
}

type ServiceRow = {
  id: string;
  tenant_id: string;
  name: string;
  category: string;
  duration_minutes: number;
  price_cents: unknown;
  active: boolean;
  deposit_required: boolean;
  deposit_type: Service["deposit"]["type"];
  deposit_value: unknown;
  assessment_required: boolean;
  created_at: unknown;
  professional_ids: unknown;
};
const mapService = (row: ServiceRow): Service => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  category: row.category,
  durationMinutes: asNumber(row.duration_minutes),
  priceCents: asNumber(row.price_cents),
  active: row.active,
  professionalIds: asStringArray(row.professional_ids),
  deposit: { required: row.deposit_required, type: row.deposit_type, value: asNumber(row.deposit_value) },
  assessmentRequired: row.assessment_required,
  createdAt: asIso(row.created_at),
});
const serviceSelect = `select s.id,s.tenant_id,s.name,s.category,s.duration_minutes,s.price_cents,s.active,s.deposit_required,s.deposit_type,s.deposit_value,s.assessment_required,s.created_at,
  coalesce(array_agg(ps.professional_id) filter (where ps.professional_id is not null), '{}') as professional_ids
  from app.services s
  left join app.professional_services ps on ps.tenant_id=s.tenant_id and ps.service_id=s.id`;

class PostgresServiceRepository implements ServiceRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<ServiceRow>(
      `${serviceSelect} where s.tenant_id=$1 and s.id=$2 group by s.id,s.tenant_id,s.name,s.category,s.duration_minutes,s.price_cents,s.active,s.deposit_required,s.deposit_type,s.deposit_value,s.assessment_required,s.created_at`,
      [tenantId, id],
    );
    return result.rows[0] ? mapService(result.rows[0]) : null;
  }

  async list(tenantId: string) {
    const result = await this.sql.query<ServiceRow>(
      `${serviceSelect} where s.tenant_id=$1 group by s.id,s.tenant_id,s.name,s.category,s.duration_minutes,s.price_cents,s.active,s.deposit_required,s.deposit_type,s.deposit_value,s.assessment_required,s.created_at order by s.name`,
      [tenantId],
    );
    return result.rows.map(mapService);
  }

  async create(entity: Service) {
    await this.sql.query(
      "insert into app.services (id,tenant_id,name,category,duration_minutes,price_cents,active,deposit_required,deposit_type,deposit_value,assessment_required,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [entity.id, entity.tenantId, entity.name, entity.category, entity.durationMinutes, entity.priceCents, entity.active, entity.deposit.required, entity.deposit.type, entity.deposit.value, entity.assessmentRequired, entity.createdAt],
    );
    for (const professionalId of entity.professionalIds) {
      await this.sql.query(
        "insert into app.professional_services (tenant_id,professional_id,service_id) values ($1,$2,$3) on conflict do nothing",
        [entity.tenantId, professionalId, entity.id],
      );
    }
    return entity;
  }

  async update(entity: Service) {
    await this.sql.query(
      "update app.services set name=$3,category=$4,duration_minutes=$5,price_cents=$6,active=$7,deposit_required=$8,deposit_type=$9,deposit_value=$10,assessment_required=$11 where tenant_id=$1 and id=$2",
      [entity.tenantId, entity.id, entity.name, entity.category, entity.durationMinutes, entity.priceCents, entity.active, entity.deposit.required, entity.deposit.type, entity.deposit.value, entity.assessmentRequired],
    );
    await this.sql.query("delete from app.professional_services where tenant_id=$1 and service_id=$2", [entity.tenantId, entity.id]);
    for (const professionalId of entity.professionalIds) {
      await this.sql.query(
        "insert into app.professional_services (tenant_id,professional_id,service_id) values ($1,$2,$3) on conflict do nothing",
        [entity.tenantId, professionalId, entity.id],
      );
    }
    return entity;
  }
}

type CustomerRow = {
  id: string;
  tenant_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  status: Customer["status"];
  relationship_profile: Customer["relationshipProfile"];
  created_at: unknown;
  updated_at: unknown;
};
const mapCustomer = (row: CustomerRow): Customer => ({
  id: row.id,
  tenantId: row.tenant_id,
  fullName: row.full_name,
  phone: row.phone,
  email: asOptionalString(row.email),
  status: row.status,
  relationshipProfile: row.relationship_profile,
  createdAt: asIso(row.created_at),
  updatedAt: asIso(row.updated_at),
});

class PostgresCustomerRepository implements CustomerRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<CustomerRow>("select * from app.customers where tenant_id=$1 and id=$2", [tenantId, id]);
    return result.rows[0] ? mapCustomer(result.rows[0]) : null;
  }

  async findDuplicates(tenantId: string, input: Pick<Customer, "phone" | "email" | "fullName">) {
    const result = await this.sql.query<CustomerRow>(
      "select * from app.customers where tenant_id=$1 and (phone=$2 or ($3::text is not null and lower(email)=lower($3)) or lower(full_name)=lower($4))",
      [tenantId, input.phone, input.email ?? null, input.fullName],
    );
    return result.rows.map(mapCustomer);
  }

  async list(tenantId: string) {
    const result = await this.sql.query<CustomerRow>("select * from app.customers where tenant_id=$1 order by full_name", [tenantId]);
    return result.rows.map(mapCustomer);
  }

  async create(entity: Customer) {
    try {
      await this.sql.query(
        "insert into app.customers (id,tenant_id,full_name,phone,email,status,relationship_profile,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [entity.id, entity.tenantId, entity.fullName, entity.phone, entity.email ?? null, entity.status, entity.relationshipProfile, entity.createdAt, entity.updatedAt],
      );
      return entity;
    } catch (error) {
      if (postgresCode(error) === "23505") throw new ConflictError("CUSTOMER_DUPLICATE", "A customer with the same phone or e-mail already exists.");
      throw error;
    }
  }

  async update(entity: Customer) {
    await this.sql.query(
      "update app.customers set full_name=$3,phone=$4,email=$5,status=$6,relationship_profile=$7,updated_at=$8 where tenant_id=$1 and id=$2",
      [entity.tenantId, entity.id, entity.fullName, entity.phone, entity.email ?? null, entity.status, entity.relationshipProfile, entity.updatedAt],
    );
    return entity;
  }
}

type AppointmentRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  professional_id: string;
  service_id: string;
  starts_at: unknown;
  ends_at: unknown;
  status: Appointment["status"];
  base_price_cents: unknown;
  discount_cents: unknown;
  final_price_cents: unknown;
  deposit_cents: unknown;
  origin: Appointment["origin"];
  created_by: string | null;
  created_at: unknown;
  updated_at: unknown;
};
const mapAppointment = (row: AppointmentRow): Appointment => ({
  id: row.id,
  tenantId: row.tenant_id,
  customerId: row.customer_id,
  professionalId: row.professional_id,
  serviceId: row.service_id,
  startsAt: asIso(row.starts_at),
  endsAt: asIso(row.ends_at),
  status: row.status,
  basePriceCents: asNumber(row.base_price_cents),
  discountCents: asNumber(row.discount_cents),
  finalPriceCents: asNumber(row.final_price_cents),
  depositCents: asNumber(row.deposit_cents),
  origin: row.origin,
  createdBy: asOptionalString(row.created_by),
  createdAt: asIso(row.created_at),
  updatedAt: asIso(row.updated_at),
});

class PostgresAppointmentRepository implements AppointmentRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<AppointmentRow>("select * from app.appointments where tenant_id=$1 and id=$2", [tenantId, id]);
    return result.rows[0] ? mapAppointment(result.rows[0]) : null;
  }

  async list(tenantId: string) {
    const result = await this.sql.query<AppointmentRow>("select * from app.appointments where tenant_id=$1 order by starts_at", [tenantId]);
    return result.rows.map(mapAppointment);
  }

  async findConflicts(tenantId: string, professionalId: string, startsAt: string, endsAt: string, ignoreId?: string) {
    const result = await this.sql.query<AppointmentRow>(
      `select * from app.appointments
       where tenant_id=$1 and professional_id=$2
         and status in ('awaiting_deposit','awaiting_confirmation','confirmed','checked_in','in_progress')
         and starts_at < $4::timestamptz and ends_at > $3::timestamptz
         and ($5::uuid is null or id<>$5::uuid)
       order by starts_at`,
      [tenantId, professionalId, startsAt, endsAt, ignoreId ?? null],
    );
    return result.rows.map(mapAppointment);
  }

  async create(entity: Appointment) {
    try {
      await this.sql.query(
        "insert into app.appointments (id,tenant_id,customer_id,professional_id,service_id,starts_at,ends_at,status,base_price_cents,discount_cents,final_price_cents,deposit_cents,origin,created_by,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
        [entity.id, entity.tenantId, entity.customerId, entity.professionalId, entity.serviceId, entity.startsAt, entity.endsAt, entity.status, entity.basePriceCents, entity.discountCents, entity.finalPriceCents, entity.depositCents, entity.origin, entity.createdBy ?? null, entity.createdAt, entity.updatedAt],
      );
      return entity;
    } catch (error) {
      if (postgresCode(error) === "23P01" && postgresConstraint(error) === "appointments_no_professional_overlap") {
        throw new ConflictError("APPOINTMENT_TIME_CONFLICT", "The professional already has a conflicting appointment.");
      }
      throw error;
    }
  }

  async update(entity: Appointment) {
    try {
      await this.sql.query(
        "update app.appointments set customer_id=$3,professional_id=$4,service_id=$5,starts_at=$6,ends_at=$7,status=$8,base_price_cents=$9,discount_cents=$10,final_price_cents=$11,deposit_cents=$12,origin=$13,updated_at=$14 where tenant_id=$1 and id=$2",
        [entity.tenantId, entity.id, entity.customerId, entity.professionalId, entity.serviceId, entity.startsAt, entity.endsAt, entity.status, entity.basePriceCents, entity.discountCents, entity.finalPriceCents, entity.depositCents, entity.origin, entity.updatedAt],
      );
      return entity;
    } catch (error) {
      if (postgresCode(error) === "23P01") throw new ConflictError("APPOINTMENT_TIME_CONFLICT", "The professional already has a conflicting appointment.");
      throw error;
    }
  }
}

type DepositRow = {
  id: string;
  tenant_id: string;
  appointment_id: string;
  amount_cents: unknown;
  status: Deposit["status"];
  payment_method: string | null;
  confirmed_at: unknown;
  confirmed_by: string | null;
  created_at: unknown;
};
const mapDeposit = (row: DepositRow): Deposit => ({
  id: row.id,
  tenantId: row.tenant_id,
  appointmentId: row.appointment_id,
  amountCents: asNumber(row.amount_cents),
  status: row.status,
  paymentMethod: asOptionalString(row.payment_method),
  confirmedAt: asOptionalIso(row.confirmed_at),
  confirmedBy: asOptionalString(row.confirmed_by),
  createdAt: asIso(row.created_at),
});

class PostgresDepositRepository implements DepositRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findByAppointmentId(tenantId: string, appointmentId: string) {
    const result = await this.sql.query<DepositRow>("select * from app.deposits where tenant_id=$1 and appointment_id=$2", [tenantId, appointmentId]);
    return result.rows[0] ? mapDeposit(result.rows[0]) : null;
  }

  async create(entity: Deposit) {
    await this.sql.query(
      "insert into app.deposits (id,tenant_id,appointment_id,amount_cents,status,payment_method,confirmed_at,confirmed_by,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [entity.id, entity.tenantId, entity.appointmentId, entity.amountCents, entity.status, entity.paymentMethod ?? null, entity.confirmedAt ?? null, entity.confirmedBy ?? null, entity.createdAt],
    );
    return entity;
  }

  async update(entity: Deposit) {
    await this.sql.query(
      "update app.deposits set amount_cents=$3,status=$4,payment_method=$5,confirmed_at=$6,confirmed_by=$7 where tenant_id=$1 and appointment_id=$2",
      [entity.tenantId, entity.appointmentId, entity.amountCents, entity.status, entity.paymentMethod ?? null, entity.confirmedAt ?? null, entity.confirmedBy ?? null],
    );
    return entity;
  }
}

type SessionRow = {
  id: string;
  tenant_id: string;
  appointment_id: string;
  customer_id: string;
  professional_id: string;
  service_id: string;
  status: Session["status"];
  started_at: unknown;
  completed_at: unknown;
  technical_form_version: number;
};
const mapSession = (row: SessionRow): Session => ({
  id: row.id,
  tenantId: row.tenant_id,
  appointmentId: row.appointment_id,
  customerId: row.customer_id,
  professionalId: row.professional_id,
  serviceId: row.service_id,
  status: row.status,
  startedAt: asIso(row.started_at),
  completedAt: asOptionalIso(row.completed_at),
  technicalFormVersion: asNumber(row.technical_form_version),
});

class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findByAppointmentId(tenantId: string, appointmentId: string) {
    const result = await this.sql.query<SessionRow>("select * from app.sessions where tenant_id=$1 and appointment_id=$2", [tenantId, appointmentId]);
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<SessionRow>("select * from app.sessions where tenant_id=$1 and id=$2", [tenantId, id]);
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async create(entity: Session) {
    await this.sql.query(
      "insert into app.sessions (id,tenant_id,appointment_id,customer_id,professional_id,service_id,status,started_at,completed_at,technical_form_version) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [entity.id, entity.tenantId, entity.appointmentId, entity.customerId, entity.professionalId, entity.serviceId, entity.status, entity.startedAt, entity.completedAt ?? null, entity.technicalFormVersion],
    );
    return entity;
  }

  async update(entity: Session) {
    await this.sql.query(
      "update app.sessions set status=$3,completed_at=$4,technical_form_version=$5 where tenant_id=$1 and id=$2",
      [entity.tenantId, entity.id, entity.status, entity.completedAt ?? null, entity.technicalFormVersion],
    );
    return entity;
  }
}

type PaymentRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  origin_type: Payment["originType"];
  origin_id: string;
  amount_cents: unknown;
  method: Payment["method"];
  status: Payment["status"];
  paid_at: unknown;
  created_at: unknown;
};
const mapPayment = (row: PaymentRow): Payment => ({
  id: row.id,
  tenantId: row.tenant_id,
  customerId: row.customer_id,
  originType: row.origin_type,
  originId: row.origin_id,
  amountCents: asNumber(row.amount_cents),
  method: row.method,
  status: row.status,
  paidAt: asOptionalIso(row.paid_at),
  createdAt: asIso(row.created_at),
});

class PostgresPaymentRepository implements PaymentRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(tenantId: string, id: string) {
    const result = await this.sql.query<PaymentRow>("select * from app.payments where tenant_id=$1 and id=$2", [tenantId, id]);
    return result.rows[0] ? mapPayment(result.rows[0]) : null;
  }

  async listByCustomer(tenantId: string, customerId: string) {
    const result = await this.sql.query<PaymentRow>("select * from app.payments where tenant_id=$1 and customer_id=$2 order by created_at desc", [tenantId, customerId]);
    return result.rows.map(mapPayment);
  }

  async create(entity: Payment) {
    await this.sql.query(
      "insert into app.payments (id,tenant_id,customer_id,origin_type,origin_id,amount_cents,method,status,paid_at,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [entity.id, entity.tenantId, entity.customerId, entity.originType, entity.originId, entity.amountCents, entity.method, entity.status, entity.paidAt ?? null, entity.createdAt],
    );
    return entity;
  }

  async update(entity: Payment) {
    await this.sql.query(
      "update app.payments set amount_cents=$3,method=$4,status=$5,paid_at=$6 where tenant_id=$1 and id=$2",
      [entity.tenantId, entity.id, entity.amountCents, entity.method, entity.status, entity.paidAt ?? null],
    );
    return entity;
  }
}

class PostgresAuditStore {
  constructor(private readonly sql: SqlExecutor) {}

  async append(event: AuditEvent) {
    if (event.tenantId) await this.sql.query("select set_config('app.tenant_id',$1,true)", [event.tenantId]);
    await this.sql.query(
      "insert into audit.events (id,tenant_id,actor_id,actor_type,action,resource_type,resource_id,request_id,correlation_id,changes,metadata,occurred_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)",
      [event.id, event.tenantId, event.actor.id ?? null, event.actor.type, event.action, event.resource.type, event.resource.id ?? null, event.requestId, event.correlationId, event.changes ? JSON.stringify(event.changes) : null, event.metadata ? JSON.stringify(event.metadata) : null, event.occurredAt],
    );
  }

  async findMany(query: AuditQuery = {}) {
    const clauses: string[] = [];
    const parameters: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      parameters.push(value);
      clauses.push(sql.replace("?", `$${parameters.length}`));
    };
    if (query.tenantId !== undefined) add("tenant_id is not distinct from ?", query.tenantId);
    if (query.action) add("action=?", query.action);
    if (query.resourceType) add("resource_type=?", query.resourceType);
    if (query.resourceId) add("resource_id=?", query.resourceId);
    if (query.correlationId) add("correlation_id=?", query.correlationId);
    const result = await this.sql.query<Record<string, unknown>>(
      `select * from audit.events${clauses.length ? ` where ${clauses.join(" and ")}` : ""} order by occurred_at desc`,
      parameters,
    );
    return result.rows.map((row): AuditEvent => ({
      id: String(row.id),
      tenantId: row.tenant_id == null ? null : String(row.tenant_id),
      actor: { type: String(row.actor_type) as AuditEvent["actor"]["type"], id: asOptionalString(row.actor_id) },
      action: String(row.action),
      resource: { type: String(row.resource_type), id: asOptionalString(row.resource_id) },
      requestId: String(row.request_id),
      correlationId: String(row.correlation_id),
      changes: (row.changes ?? undefined) as Record<string, unknown> | undefined,
      metadata: (row.metadata ?? undefined) as Record<string, unknown> | undefined,
      occurredAt: asIso(row.occurred_at),
    }));
  }
}

class PostgresOutboxStore {
  constructor(private readonly sql: SqlExecutor) {}

  async append(event: OutboxEvent) {
    await this.sql.query(
      "insert into app.outbox_events (id,tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload,status,attempts,created_at,published_at,last_error) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)",
      [event.id, event.tenantId ?? null, event.type, event.aggregateType, event.aggregateId, event.correlationId, JSON.stringify(event.payload), event.status, event.attempts, event.createdAt, event.publishedAt ?? null, event.lastError ?? null],
    );
  }

  async findPending(limit = 50) {
    const result = await this.sql.query<Record<string, unknown>>(
      "select * from app.outbox_events where status in ('pending','failed') order by created_at for update skip locked limit $1",
      [limit],
    );
    return result.rows.map((row): OutboxEvent => ({
      id: String(row.id),
      tenantId: asOptionalString(row.tenant_id),
      type: String(row.event_type),
      aggregateType: String(row.aggregate_type),
      aggregateId: String(row.aggregate_id),
      correlationId: String(row.correlation_id),
      payload: (row.payload ?? {}) as Record<string, unknown>,
      status: String(row.status) as OutboxEvent["status"],
      attempts: asNumber(row.attempts),
      createdAt: asIso(row.created_at),
      publishedAt: asOptionalIso(row.published_at),
      lastError: asOptionalString(row.last_error),
    }));
  }

  async markProcessing(id: string) {
    await this.sql.query("update app.outbox_events set status='processing', attempts=attempts+1 where id=$1", [id]);
  }

  async markPublished(id: string) {
    await this.sql.query("update app.outbox_events set status='published', published_at=now(), last_error=null where id=$1", [id]);
  }

  async markFailed(id: string, error: string) {
    await this.sql.query("update app.outbox_events set status='failed', last_error=$2 where id=$1", [id, error.slice(0, 2000)]);
  }
}

class PostgresIdempotencyStore {
  constructor(private readonly sql: SqlExecutor) {}

  async find(tenantId: string, operation: string, key: string) {
    const result = await this.sql.query<Record<string, unknown>>(
      "select * from app.idempotency_keys where tenant_id=$1 and operation=$2 and idempotency_key=$3",
      [tenantId, operation, key],
    );
    const row = result.rows[0];
    return row ? {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      key: String(row.idempotency_key),
      operation: String(row.operation),
      requestHash: String(row.request_hash),
      status: String(row.status) as IdempotencyRecord["status"],
      response: row.response,
      expiresAt: asIso(row.expires_at),
    } : null;
  }

  async reserve(record: IdempotencyRecord) {
    try {
      await this.sql.query(
        "insert into app.idempotency_keys (id,tenant_id,idempotency_key,operation,request_hash,status,response,expires_at) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",
        [record.id, record.tenantId, record.key, record.operation, record.requestHash, record.status, record.response === undefined ? null : JSON.stringify(record.response), record.expiresAt],
      );
    } catch (error) {
      if (postgresCode(error) === "23505") {
        throw new ConflictError("IDEMPOTENCY_CONFLICT", "The idempotency key is already reserved for this tenant and operation.");
      }
      throw error;
    }
  }

  async complete(tenantId: string, operation: string, key: string, response: unknown) {
    await this.sql.query(
      "update app.idempotency_keys set status='completed', response=$4::jsonb, updated_at=now() where tenant_id=$1 and operation=$2 and idempotency_key=$3",
      [tenantId, operation, key, JSON.stringify(response)],
    );
  }

  async fail(tenantId: string, operation: string, key: string) {
    await this.sql.query(
      "update app.idempotency_keys set status='failed', updated_at=now() where tenant_id=$1 and operation=$2 and idempotency_key=$3",
      [tenantId, operation, key],
    );
  }
}

export function createPostgresTransactionContext(sql: SqlExecutor): TransactionContext {
  return {
    tenants: new PostgresTenantRepository(sql),
    tenantBranding: new PostgresTenantBrandingRepository(sql),
    professionals: new PostgresProfessionalRepository(sql),
    services: new PostgresServiceRepository(sql),
    customers: new PostgresCustomerRepository(sql),
    appointments: new PostgresAppointmentRepository(sql),
    deposits: new PostgresDepositRepository(sql),
    sessions: new PostgresSessionRepository(sql),
    payments: new PostgresPaymentRepository(sql),
    audit: new PostgresAuditStore(sql),
    outbox: new PostgresOutboxStore(sql),
    idempotency: new PostgresIdempotencyStore(sql),
  };
}

export class PostgresUnitOfWork implements UnitOfWork {
  constructor(private readonly client: SqlClient) {}

  async execute<T>(context: ExecutionContext, work: (transaction: TransactionContext) => Promise<T>): Promise<T> {
    return this.client.transaction(async (sql) => {
      await setTenantContext(sql, context.tenantId, context.actorId);
      return work(createPostgresTransactionContext(sql));
    });
  }
}

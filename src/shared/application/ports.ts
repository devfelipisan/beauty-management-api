import type { TenantBranding } from "@/modules/tenant-branding/domain/tenant-branding";
import type { ExecutionContext } from "@/shared/application/execution-context";
import type { AuditReader, AuditWriter } from "@/shared/audit/audit";
import type { EntityId } from "@/shared/domain/core";
import type { Appointment, Customer, Deposit, Payment, Professional, Service, Session, Tenant } from "@/shared/domain/models";
import type { IdempotencyStore } from "@/shared/idempotency/idempotency";
import type { OutboxStore } from "@/shared/outbox/outbox";

export interface TenantRepository {
  findById(id: EntityId): Promise<Tenant | null>;
  findByDocument(document: string): Promise<Tenant | null>;
  findByPublicSlug(slug: string): Promise<Tenant | null>;
  list(): Promise<Tenant[]>;
  create(entity: Tenant): Promise<Tenant>;
}

export interface TenantBrandingRepository {
  findByTenantId(tenantId: EntityId): Promise<TenantBranding | null>;
  save(branding: TenantBranding): Promise<TenantBranding>;
}

export interface ProfessionalRepository {
  findById(tenantId: EntityId, id: EntityId): Promise<Professional | null>;
  list(tenantId: EntityId): Promise<Professional[]>;
  create(entity: Professional): Promise<Professional>;
  update(entity: Professional): Promise<Professional>;
}

export interface ServiceRepository {
  findById(tenantId: EntityId, id: EntityId): Promise<Service | null>;
  list(tenantId: EntityId): Promise<Service[]>;
  create(entity: Service): Promise<Service>;
  update(entity: Service): Promise<Service>;
}

export interface CustomerRepository {
  findById(tenantId: EntityId, id: EntityId): Promise<Customer | null>;
  findDuplicates(tenantId: EntityId, input: Pick<Customer, "phone" | "email" | "fullName">): Promise<Customer[]>;
  list(tenantId: EntityId): Promise<Customer[]>;
  create(entity: Customer): Promise<Customer>;
  update(entity: Customer): Promise<Customer>;
}

export interface AppointmentRepository {
  findById(tenantId: EntityId, id: EntityId): Promise<Appointment | null>;
  list(tenantId: EntityId): Promise<Appointment[]>;
  listByProfessional(tenantId: EntityId, professionalId: EntityId): Promise<Appointment[]>;
  findConflicts(tenantId: EntityId, professionalId: EntityId, startsAt: string, endsAt: string, ignoreId?: EntityId): Promise<Appointment[]>;
  create(entity: Appointment): Promise<Appointment>;
  update(entity: Appointment): Promise<Appointment>;
}

export interface DepositRepository {
  findByAppointmentId(tenantId: EntityId, appointmentId: EntityId): Promise<Deposit | null>;
  create(entity: Deposit): Promise<Deposit>;
  update(entity: Deposit): Promise<Deposit>;
}

export interface SessionRepository {
  findByAppointmentId(tenantId: EntityId, appointmentId: EntityId): Promise<Session | null>;
  findById(tenantId: EntityId, id: EntityId): Promise<Session | null>;
  create(entity: Session): Promise<Session>;
  update(entity: Session): Promise<Session>;
}

export interface PaymentRepository {
  findById(tenantId: EntityId, id: EntityId): Promise<Payment | null>;
  listByCustomer(tenantId: EntityId, customerId: EntityId): Promise<Payment[]>;
  create(entity: Payment): Promise<Payment>;
  update(entity: Payment): Promise<Payment>;
}

export interface TransactionRepositories {
  tenants: TenantRepository;
  tenantBranding: TenantBrandingRepository;
  professionals: ProfessionalRepository;
  services: ServiceRepository;
  customers: CustomerRepository;
  appointments: AppointmentRepository;
  deposits: DepositRepository;
  sessions: SessionRepository;
  payments: PaymentRepository;
}

export interface TransactionContext extends TransactionRepositories {
  audit: AuditWriter & AuditReader;
  outbox: OutboxStore;
  idempotency: IdempotencyStore;
}

export interface UnitOfWork {
  execute<T>(context: ExecutionContext, work: (transaction: TransactionContext) => Promise<T>): Promise<T>;
}

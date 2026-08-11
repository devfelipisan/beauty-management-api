import type { Lead } from "@/modules/leads/domain/lead";
import type { LeadRepository } from "@/modules/leads/domain/lead-repository";
import type { TenantBranding } from "@/modules/tenant-branding/domain/tenant-branding";
import { DEFAULT_ROLE_PERMISSIONS, Permissions, type PermissionCode } from "@/server/auth/permissions";
import type { AccessControlRepository, PlatformAccess, TenantAccess } from "@/server/auth/authorization";
import type { ExecutionContext } from "@/shared/application/execution-context";
import type { TransactionContext, UnitOfWork } from "@/shared/application/ports";
import type { AuditEvent, AuditQuery } from "@/shared/audit/audit";
import type { Appointment, Customer, Deposit, Payment, Professional, Service, Session, Tenant } from "@/shared/domain/models";
import type { IdempotencyRecord } from "@/shared/idempotency/idempotency";
import type { OutboxEvent } from "@/shared/outbox/outbox";
import { createMemoryVolumeSeed } from "./memory-volume-seed";

interface MemoryState {
  tenants: Tenant[];
  tenantBranding: TenantBranding[];
  professionals: Professional[];
  services: Service[];
  customers: Customer[];
  appointments: Appointment[];
  deposits: Deposit[];
  sessions: Session[];
  payments: Payment[];
  leads: Lead[];
  audit: AuditEvent[];
  outbox: OutboxEvent[];
  idempotency: IdempotencyRecord[];
}

function seedState(): MemoryState {
  return createMemoryVolumeSeed();
}

function activeAppointment(status: Appointment["status"]): boolean {
  return !new Set<Appointment["status"]>(["completed", "rescheduled", "canceled", "no_show", "expired"]).has(status);
}

function replaceById<T extends { id: string }>(items: T[], entity: T): T {
  const index = items.findIndex((item) => item.id === entity.id);
  if (index < 0) throw new Error(`Entity ${entity.id} was not found for update.`);
  items[index] = entity;
  return entity;
}

function transactionContext(state: MemoryState): TransactionContext {
  return {
    tenants: {
      findById: async (id) => state.tenants.find((item) => item.id === id) ?? null,
      findByDocument: async (document) => state.tenants.find((item) => item.document === document) ?? null,
      list: async () => [...state.tenants],
      create: async (entity) => { state.tenants.push(entity); return entity; },
    },
    tenantBranding: {
      findByTenantId: async (tenantId) => state.tenantBranding.find((item) => item.tenantId === tenantId) ?? null,
      save: async (branding) => {
        const index = state.tenantBranding.findIndex((item) => item.tenantId === branding.tenantId);
        if (index >= 0) state.tenantBranding[index] = branding;
        else state.tenantBranding.push(branding);
        return branding;
      },
    },
    professionals: {
      findById: async (tenantId, id) => state.professionals.find((item) => item.tenantId === tenantId && item.id === id) ?? null,
      list: async (tenantId) => state.professionals.filter((item) => item.tenantId === tenantId),
      create: async (entity) => { state.professionals.push(entity); return entity; },
      update: async (entity) => replaceById(state.professionals, entity),
    },
    services: {
      findById: async (tenantId, id) => state.services.find((item) => item.tenantId === tenantId && item.id === id) ?? null,
      list: async (tenantId) => state.services.filter((item) => item.tenantId === tenantId),
      create: async (entity) => { state.services.push(entity); return entity; },
      update: async (entity) => replaceById(state.services, entity),
    },
    customers: {
      findById: async (tenantId, id) => state.customers.find((item) => item.tenantId === tenantId && item.id === id) ?? null,
      findDuplicates: async (tenantId, input) => state.customers.filter((item) =>
        item.tenantId === tenantId && (item.phone === input.phone || Boolean(input.email && item.email === input.email) || item.fullName.toLowerCase() === input.fullName.toLowerCase()),
      ),
      list: async (tenantId) => state.customers.filter((item) => item.tenantId === tenantId),
      create: async (entity) => { state.customers.push(entity); return entity; },
      update: async (entity) => replaceById(state.customers, entity),
    },
    appointments: {
      findById: async (tenantId, id) => state.appointments.find((item) => item.tenantId === tenantId && item.id === id) ?? null,
      list: async (tenantId) => state.appointments.filter((item) => item.tenantId === tenantId),
      findConflicts: async (tenantId, professionalId, startsAt, endsAt, ignoreId) => {
        const start = Date.parse(startsAt);
        const end = Date.parse(endsAt);
        return state.appointments.filter((item) =>
          item.tenantId === tenantId && item.professionalId === professionalId && item.id !== ignoreId && activeAppointment(item.status)
          && Date.parse(item.startsAt) < end && Date.parse(item.endsAt) > start,
        );
      },
      create: async (entity) => { state.appointments.push(entity); return entity; },
      update: async (entity) => replaceById(state.appointments, entity),
    },
    deposits: {
      findByAppointmentId: async (tenantId, appointmentId) => state.deposits.find((item) => item.tenantId === tenantId && item.appointmentId === appointmentId) ?? null,
      create: async (entity) => { state.deposits.push(entity); return entity; },
      update: async (entity) => replaceById(state.deposits, entity),
    },
    sessions: {
      findByAppointmentId: async (tenantId, appointmentId) => state.sessions.find((item) => item.tenantId === tenantId && item.appointmentId === appointmentId) ?? null,
      findById: async (tenantId, id) => state.sessions.find((item) => item.tenantId === tenantId && item.id === id) ?? null,
      create: async (entity) => { state.sessions.push(entity); return entity; },
      update: async (entity) => replaceById(state.sessions, entity),
    },
    payments: {
      findById: async (tenantId, id) => state.payments.find((item) => item.tenantId === tenantId && item.id === id) ?? null,
      listByCustomer: async (tenantId, customerId) => state.payments.filter((item) => item.tenantId === tenantId && item.customerId === customerId),
      create: async (entity) => { state.payments.push(entity); return entity; },
      update: async (entity) => replaceById(state.payments, entity),
    },
    audit: {
      append: async (event) => { state.audit.push(event); },
      findMany: async (query?: AuditQuery) => state.audit.filter((item) => {
        if (query?.tenantId !== undefined && item.tenantId !== query.tenantId) return false;
        if (query?.action && item.action !== query.action) return false;
        if (query?.resourceType && item.resource.type !== query.resourceType) return false;
        if (query?.resourceId && item.resource.id !== query.resourceId) return false;
        if (query?.correlationId && item.correlationId !== query.correlationId) return false;
        return true;
      }),
    },
    outbox: {
      append: async (event) => { state.outbox.push(event); },
      findPending: async (limit = 50) => state.outbox.filter((item) => item.status === "pending").slice(0, limit),
      markProcessing: async (id) => { const item = state.outbox.find((event) => event.id === id); if (item) { item.status = "processing"; item.attempts += 1; } },
      markPublished: async (id) => { const item = state.outbox.find((event) => event.id === id); if (item) { item.status = "published"; item.publishedAt = new Date().toISOString(); } },
      markFailed: async (id, error) => { const item = state.outbox.find((event) => event.id === id); if (item) { item.status = "failed"; item.lastError = error; item.attempts += 1; } },
    },
    idempotency: {
      find: async (tenantId, operation, key) => state.idempotency.find((item) => item.tenantId === tenantId && item.operation === operation && item.key === key) ?? null,
      reserve: async (record) => { state.idempotency.push(record); },
      complete: async (tenantId, operation, key, response) => {
        const item = state.idempotency.find((record) => record.tenantId === tenantId && record.operation === operation && record.key === key);
        if (item) { item.status = "completed"; item.response = response; }
      },
      fail: async (tenantId, operation, key) => {
        const item = state.idempotency.find((record) => record.tenantId === tenantId && record.operation === operation && record.key === key);
        if (item) item.status = "failed";
      },
    },
  };
}

export class MemoryUnitOfWork implements UnitOfWork {
  constructor(private state: MemoryState) {}

  async execute<T>(_context: ExecutionContext, work: (transaction: TransactionContext) => Promise<T>): Promise<T> {
    const draft = structuredClone(this.state) as MemoryState;
    const result = await work(transactionContext(draft));
    Object.assign(this.state, draft);
    return result;
  }
}

export class MemoryLeadRepository implements LeadRepository {
  constructor(private readonly state: MemoryState) {}

  async findById(tenantId: string, id: string) { return this.state.leads.find((item) => item.tenantId === tenantId && item.id === id) ?? null; }
  async findPotentialDuplicates(tenantId: string, input: Pick<Lead, "phone" | "email">) {
    return this.state.leads.filter((item) => item.tenantId === tenantId && ((input.phone && item.phone === input.phone) || (input.email && item.email === input.email)));
  }
  async list(tenantId: string) { return this.state.leads.filter((item) => item.tenantId === tenantId); }
  async create(entity: Lead) { this.state.leads.push(entity); return entity; }
  async update(entity: Lead) { return replaceById(this.state.leads, entity); }
}

export class MemoryAccessControlRepository implements AccessControlRepository {
  private roleForSubject(authSubject: string): "tenant_admin" | "reception" | "professional" | "platform_admin" | null {
    if (authSubject === "user-platform-admin") return "platform_admin";
    if (authSubject === "user-tenant-admin") return "tenant_admin";
    if (authSubject === "user-reception") return "reception";
    if (authSubject === "user-professional") return "professional";
    return null;
  }

  async resolveTenantAccess(authSubject: string, tenantId: string): Promise<TenantAccess | null> {
    const role = this.roleForSubject(authSubject);
    if (!role || role === "platform_admin") return null;
    if (tenantId !== "tenant-bella") return null;
    return {
      actorId: authSubject,
      authSubject,
      tenantId,
      membershipId: `${tenantId}:${authSubject}`,
      membershipStatus: "active",
      roles: [role],
      permissions: [...DEFAULT_ROLE_PERMISSIONS[role]],
    };
  }

  async resolvePlatformAccess(authSubject: string): Promise<PlatformAccess | null> {
    if (authSubject !== "user-platform-admin") return null;
    return { actorId: authSubject, authSubject, roles: ["platform_admin"], permissions: Object.values(Permissions) as PermissionCode[] };
  }
}

export function createMemoryRuntime() {
  const state = seedState();
  return {
    unitOfWork: new MemoryUnitOfWork(state),
    leadRepository: new MemoryLeadRepository(state),
    accessControl: new MemoryAccessControlRepository(),
  };
}

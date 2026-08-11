import type { Lead } from "@/modules/leads/domain/lead";
import type { TenantBranding } from "@/modules/tenant-branding/domain/tenant-branding";
import type { AuditEvent } from "@/shared/audit/audit";
import type { Appointment, Customer, Deposit, Payment, Professional, Service, Session, Tenant } from "@/shared/domain/models";
import type { IdempotencyRecord } from "@/shared/idempotency/idempotency";
import type { OutboxEvent } from "@/shared/outbox/outbox";

/**
 * Empty state for isolated unit/repository tests only.
 * Production composition never imports this adapter and no demo/business data lives in memory.
 */
export function createMemoryVolumeSeed(): {
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
} {
  return {
    tenants: [], tenantBranding: [], professionals: [], services: [], customers: [], appointments: [], deposits: [],
    sessions: [], payments: [], leads: [], audit: [], outbox: [], idempotency: [],
  };
}

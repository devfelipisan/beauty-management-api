import type { ExecutionContext } from "@/shared/application/execution-context";
import { createEntityId, nowIso, type EntityId, type IsoDateTime } from "@/shared/domain/core";

export const AuditActions = {
  TenantCreated: "tenant.created",
  TenantBrandingUpdated: "tenant.branding.updated",
  ProfessionalCreated: "professional.created",
  ProfessionalDisabled: "professional.disabled",
  ServiceCreated: "service.created",
  CustomerCreated: "customer.created",
  CustomerProfileChanged: "customer.profile.changed",
  AppointmentCreated: "appointment.created",
  AppointmentRescheduled: "appointment.rescheduled",
  AppointmentCanceled: "appointment.canceled",
  DepositConfirmed: "deposit.confirmed",
  SessionStarted: "session.started",
  SessionCompleted: "session.completed",
  PaymentRegistered: "payment.registered",
  PaymentRefunded: "payment.refunded",
  PackageConsumed: "package.consumed",
  LicenseSuspended: "license.suspended",
} as const;

export interface AuditEvent {
  id: EntityId;
  tenantId: EntityId | null;
  actor: { type: "user" | "system" | "worker" | "job"; id?: EntityId };
  action: string;
  resource: { type: string; id?: EntityId };
  requestId: string;
  correlationId: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  occurredAt: IsoDateTime;
}

export interface AuditWriter { append(event: AuditEvent): Promise<void>; }
export interface AuditQuery { tenantId?: EntityId | null; action?: string; resourceType?: string; resourceId?: EntityId; correlationId?: string; }
export interface AuditReader { findMany(query?: AuditQuery): Promise<AuditEvent[]>; }

export function createAuditEvent(
  context: ExecutionContext,
  input: Omit<AuditEvent, "id" | "requestId" | "correlationId" | "occurredAt" | "tenantId" | "actor"> & {
    tenantId?: EntityId | null;
    actorType?: AuditEvent["actor"]["type"];
  },
): AuditEvent {
  return {
    id: createEntityId(),
    tenantId: input.tenantId ?? context.tenantId ?? null,
    actor: { type: input.actorType ?? "user", id: context.actorId },
    action: input.action,
    resource: input.resource,
    requestId: context.requestId,
    correlationId: context.correlationId,
    changes: input.changes,
    metadata: input.metadata,
    occurredAt: nowIso(),
  };
}

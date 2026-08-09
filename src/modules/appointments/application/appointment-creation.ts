import type { ExecutionContext } from "@/shared/application/execution-context";
import type { TransactionContext } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { ConflictError, ForbiddenError, NotFoundError, assertMoneyCents, createEntityId, nowIso } from "@/shared/domain/core";
import type { Appointment, Deposit } from "@/shared/domain/models";
import { createOutboxEvent } from "@/shared/outbox/outbox";

export interface AppointmentCreationInput {
  customerId: string;
  professionalId: string;
  serviceId: string;
  startsAt: string;
  discountCents?: number;
  origin?: Appointment["origin"];
}

export interface AppointmentCreationOutput { appointment: Appointment; deposit: Deposit; }

export async function createAppointmentInTransaction(
  transaction: TransactionContext,
  context: ExecutionContext,
  input: AppointmentCreationInput,
): Promise<AppointmentCreationOutput> {
  if (!context.tenantId) throw new Error("Tenant is required to create an appointment.");
  const tenantId = context.tenantId;

  const tenant = await transaction.tenants.findById(tenantId);
  if (!tenant) throw new NotFoundError("tenant", tenantId);
  if (!new Set(["trial", "active"]).has(tenant.status)) {
    throw new ForbiddenError("TENANT_NOT_OPERATIONAL", "Tenant is not allowed to create appointments.");
  }

  const [customer, professional, service] = await Promise.all([
    transaction.customers.findById(tenantId, input.customerId),
    transaction.professionals.findById(tenantId, input.professionalId),
    transaction.services.findById(tenantId, input.serviceId),
  ]);
  if (!customer) throw new NotFoundError("customer", input.customerId);
  if (!professional) throw new NotFoundError("professional", input.professionalId);
  if (!service) throw new NotFoundError("service", input.serviceId);
  if (customer.status !== "active") throw new ForbiddenError("CUSTOMER_INACTIVE", "Customer is not active.");
  if (!professional.active) throw new ForbiddenError("PROFESSIONAL_INACTIVE", "Professional is not active.");
  if (!service.active) throw new ForbiddenError("SERVICE_INACTIVE", "Service is not active.");
  if (!professional.serviceIds.includes(service.id) || !service.professionalIds.includes(professional.id)) {
    throw new ForbiddenError("PROFESSIONAL_NOT_QUALIFIED", "Professional is not enabled for this service.");
  }

  const startsAtMs = Date.parse(input.startsAt);
  if (!Number.isFinite(startsAtMs)) throw new Error("Invalid appointment start date.");
  const endsAt = new Date(startsAtMs + service.durationMinutes * 60_000).toISOString();
  const conflicts = await transaction.appointments.findConflicts(tenantId, professional.id, input.startsAt, endsAt);
  if (conflicts.length > 0) {
    throw new ConflictError("APPOINTMENT_TIME_CONFLICT", "The professional already has a conflicting appointment.", {
      conflictingAppointmentIds: conflicts.map((item) => item.id),
    });
  }

  const basePriceCents = assertMoneyCents(service.priceCents, "basePriceCents");
  const discountCents = assertMoneyCents(input.discountCents ?? 0, "discountCents");
  if (discountCents > basePriceCents) throw new ConflictError("DISCOUNT_EXCEEDS_PRICE", "Discount cannot exceed the base price.");
  const finalPriceCents = basePriceCents - discountCents;
  let depositCents = 0;
  if (service.deposit.required && service.deposit.type === "fixed") depositCents = Math.min(service.deposit.value, finalPriceCents);
  if (service.deposit.required && service.deposit.type === "percentage") depositCents = Math.round(finalPriceCents * service.deposit.value / 100);
  depositCents = assertMoneyCents(depositCents, "depositCents");

  const timestamp = nowIso();
  const appointment: Appointment = {
    id: createEntityId(), tenantId, customerId: customer.id, professionalId: professional.id, serviceId: service.id,
    startsAt: new Date(startsAtMs).toISOString(), endsAt,
    status: service.deposit.required ? "awaiting_deposit" : "awaiting_confirmation",
    basePriceCents, discountCents, finalPriceCents, depositCents,
    origin: input.origin ?? "reception", createdBy: context.actorId, createdAt: timestamp, updatedAt: timestamp,
  };
  const deposit: Deposit = {
    id: createEntityId(), tenantId, appointmentId: appointment.id, amountCents: depositCents,
    status: service.deposit.required ? "awaiting_payment" : "not_required", createdAt: timestamp,
  };

  await transaction.appointments.create(appointment);
  await transaction.deposits.create(deposit);
  await transaction.audit.append(createAuditEvent(context, {
    action: AuditActions.AppointmentCreated,
    resource: { type: "appointment", id: appointment.id },
    metadata: { customerId: customer.id, professionalId: professional.id, serviceId: service.id, basePriceCents, discountCents, finalPriceCents, depositCents, origin: appointment.origin },
  }));
  await transaction.outbox.append(createOutboxEvent({
    tenantId, type: "appointment.created", aggregateType: "appointment", aggregateId: appointment.id,
    correlationId: context.correlationId, payload: { appointmentId: appointment.id },
  }));
  return { appointment, deposit };
}

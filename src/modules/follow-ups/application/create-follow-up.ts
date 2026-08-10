import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { DomainError, NotFoundError } from "@/shared/domain/core";
import { createOutboxEvent } from "@/shared/outbox/outbox";
import { createFollowUp, type FollowUp } from "../domain/follow-up";
import type { FollowUpRepository } from "../domain/follow-up-repository";

export interface CreateFollowUpInput {
  customerId: string;
  sessionId?: string;
  suggestedAt: string;
  reason?: string;
  appointmentId?: string;
}

export class CreateFollowUpUseCase {
  constructor(private readonly unitOfWork: UnitOfWork, private readonly followUps: FollowUpRepository) {}

  async execute(context: ExecutionContext, input: CreateFollowUpInput): Promise<FollowUp> {
    if (!context.tenantId) throw new Error("Tenant is required to create a follow-up.");
    const tenantId = context.tenantId;
    return this.unitOfWork.execute(context, async (tx) => {
      const customer = await tx.customers.findById(tenantId, input.customerId);
      if (!customer) throw new NotFoundError("customer", input.customerId);
      if (input.sessionId) {
        const session = await tx.sessions.findById(tenantId, input.sessionId);
        if (!session) throw new NotFoundError("session", input.sessionId);
        if (session.customerId !== customer.id) throw new DomainError("FOLLOW_UP_CUSTOMER_MISMATCH", "Session does not belong to the informed customer.");
      }
      if (input.appointmentId) {
        const appointment = await tx.appointments.findById(tenantId, input.appointmentId);
        if (!appointment) throw new NotFoundError("appointment", input.appointmentId);
        if (appointment.customerId !== customer.id) throw new DomainError("FOLLOW_UP_APPOINTMENT_CUSTOMER_MISMATCH", "Appointment does not belong to the informed customer.");
      }
      const entity = createFollowUp({ ...input, tenantId });
      await this.followUps.create(entity);
      await tx.audit.append(createAuditEvent(context, {
        action: AuditActions.FollowUpCreated,
        resource: { type: "follow-up", id: entity.id },
        metadata: { customerId: entity.customerId, sessionId: entity.sessionId, appointmentId: entity.appointmentId },
      }));
      await tx.outbox.append(createOutboxEvent({
        tenantId,
        type: "follow-up.created",
        aggregateType: "follow-up",
        aggregateId: entity.id,
        correlationId: context.correlationId,
        payload: { followUpId: entity.id, customerId: entity.customerId },
      }));
      return entity;
    });
  }
}

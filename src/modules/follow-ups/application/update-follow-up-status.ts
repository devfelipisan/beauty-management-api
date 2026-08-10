import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { DomainError, NotFoundError } from "@/shared/domain/core";
import { createOutboxEvent } from "@/shared/outbox/outbox";
import { transitionFollowUp, type FollowUp, type FollowUpAction } from "../domain/follow-up";
import type { FollowUpRepository } from "../domain/follow-up-repository";

export interface UpdateFollowUpStatusInput {
  followUpId: string;
  action: FollowUpAction;
  appointmentId?: string;
}

export class UpdateFollowUpStatusUseCase {
  constructor(private readonly unitOfWork: UnitOfWork, private readonly followUps: FollowUpRepository) {}

  async execute(context: ExecutionContext, input: UpdateFollowUpStatusInput): Promise<FollowUp> {
    if (!context.tenantId) throw new Error("Tenant is required to update a follow-up.");
    const tenantId = context.tenantId;
    return this.unitOfWork.execute(context, async (tx) => {
      const current = await this.followUps.findById(tenantId, input.followUpId);
      if (!current) throw new NotFoundError("follow-up", input.followUpId);
      if (input.action === "schedule") {
        if (!input.appointmentId) throw new DomainError("FOLLOW_UP_APPOINTMENT_REQUIRED", "Appointment is required to schedule a follow-up.");
        const appointment = await tx.appointments.findById(tenantId, input.appointmentId);
        if (!appointment) throw new NotFoundError("appointment", input.appointmentId);
        if (appointment.customerId !== current.customerId) throw new DomainError("FOLLOW_UP_APPOINTMENT_CUSTOMER_MISMATCH", "Appointment does not belong to the follow-up customer.");
      }
      const updated = transitionFollowUp(current, input.action, input.appointmentId);
      await this.followUps.update(updated);
      await tx.audit.append(createAuditEvent(context, {
        action: AuditActions.FollowUpStatusChanged,
        resource: { type: "follow-up", id: updated.id },
        changes: { status: { from: current.status, to: updated.status } },
        metadata: { action: input.action, appointmentId: updated.appointmentId },
      }));
      await tx.outbox.append(createOutboxEvent({
        tenantId,
        type: "follow-up.status.changed",
        aggregateType: "follow-up",
        aggregateId: updated.id,
        correlationId: context.correlationId,
        payload: { followUpId: updated.id, status: updated.status, action: input.action },
      }));
      return updated;
    });
  }
}

import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { DomainError, ForbiddenError, NotFoundError } from "@/shared/domain/core";
import { createOutboxEvent } from "@/shared/outbox/outbox";
import { createTechnicalRecord, type TechnicalRecord } from "../domain/technical-record";
import type { TechnicalRecordRepository } from "../domain/technical-record-repository";
import type { EquipmentRepository } from "@/modules/equipment/domain/equipment-repository";

export interface CreateTechnicalRecordInput {
  sessionId: string;
  region?: string;
  equipmentId?: string;
  power?: number;
  powerUnit?: string;
  reaction?: string;
  notes?: string;
}

export class CreateTechnicalRecordUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly technicalRecords: TechnicalRecordRepository,
    private readonly equipment: EquipmentRepository,
  ) {}

  async execute(context: ExecutionContext, input: CreateTechnicalRecordInput): Promise<TechnicalRecord> {
    if (!context.tenantId) throw new Error("Tenant is required to create a technical record.");
    const tenantId = context.tenantId;
    return this.unitOfWork.execute(context, async (tx) => {
      const session = await tx.sessions.findById(tenantId, input.sessionId);
      if (!session) throw new NotFoundError("session", input.sessionId);
      if (context.professionalId && session.professionalId !== context.professionalId) {
        throw new ForbiddenError(
          "PROFESSIONAL_SESSION_FORBIDDEN",
          "A professional can add technical records only to their own sessions.",
          { sessionId: session.id },
        );
      }
      if (session.status !== "in_progress") {
        throw new DomainError("SESSION_NOT_IN_PROGRESS", "Technical records can only be added to an in-progress session.", { sessionId: session.id, status: session.status });
      }
      if (input.equipmentId) {
        const equipment = await this.equipment.findById(tenantId, input.equipmentId);
        if (!equipment) throw new NotFoundError("equipment", input.equipmentId);
        if (equipment.status !== "available") {
          throw new DomainError("EQUIPMENT_NOT_AVAILABLE", "Selected equipment is not available for use.", { equipmentId: equipment.id, status: equipment.status });
        }
        if (!equipment.serviceIds.includes(session.serviceId)) {
          throw new DomainError("EQUIPMENT_SERVICE_INCOMPATIBLE", "Selected equipment is not linked to the session service.", { equipmentId: equipment.id, serviceId: session.serviceId });
        }
      }
      const entity = createTechnicalRecord({ ...input, tenantId });
      await this.technicalRecords.create(entity);
      await tx.audit.append(createAuditEvent(context, {
        action: AuditActions.TechnicalRecordCreated,
        resource: { type: "technical-record", id: entity.id },
        metadata: { sessionId: entity.sessionId, equipmentId: entity.equipmentId },
      }));
      await tx.outbox.append(createOutboxEvent({
        tenantId,
        type: "technical-record.created",
        aggregateType: "session",
        aggregateId: entity.sessionId,
        correlationId: context.correlationId,
        payload: { technicalRecordId: entity.id, sessionId: entity.sessionId },
      }));
      return entity;
    });
  }
}

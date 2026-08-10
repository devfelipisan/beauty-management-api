import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { NotFoundError } from "@/shared/domain/core";
import { createOutboxEvent } from "@/shared/outbox/outbox";
import { createEquipment, type Equipment } from "../domain/equipment";
import type { EquipmentRepository } from "../domain/equipment-repository";

export interface CreateEquipmentInput {
  name: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  primaryUnit?: string;
  serviceIds: string[];
  notes?: string;
}

export class CreateEquipmentUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly equipment: EquipmentRepository,
  ) {}

  async execute(context: ExecutionContext, input: CreateEquipmentInput): Promise<Equipment> {
    if (!context.tenantId) throw new Error("Tenant is required to create equipment.");
    const tenantId = context.tenantId;
    const serviceIds = [...new Set(input.serviceIds ?? [])];

    return this.unitOfWork.execute(context, async (transaction) => {
      for (const serviceId of serviceIds) {
        const service = await transaction.services.findById(tenantId, serviceId);
        if (!service) throw new NotFoundError("service", serviceId);
      }

      const entity = createEquipment({ ...input, tenantId, serviceIds });
      await this.equipment.create(entity);
      await transaction.audit.append(createAuditEvent(context, {
        action: AuditActions.EquipmentCreated,
        resource: { type: "equipment", id: entity.id },
        metadata: { serviceIds: entity.serviceIds, status: entity.status },
      }));
      await transaction.outbox.append(createOutboxEvent({
        tenantId,
        type: "equipment.created",
        aggregateType: "equipment",
        aggregateId: entity.id,
        correlationId: context.correlationId,
        payload: { equipmentId: entity.id },
      }));
      return entity;
    });
  }
}

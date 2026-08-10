import type { ExecutionContext } from "@/shared/application/execution-context";
import { NotFoundError } from "@/shared/domain/core";
import { AuditActions, createAuditEvent, type AuditWriter } from "@/shared/audit/audit";
import { createOutboxEvent, type OutboxStore } from "@/shared/outbox/outbox";
import { createEquipment, type Equipment } from "../domain/equipment";
import type { EquipmentRepository } from "../domain/equipment-repository";
import type { ServiceRepository } from "@/shared/application/ports";

export interface CreateEquipmentInput {
  name: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  primaryUnit?: string;
  serviceIds: string[];
  notes?: string;
}

export interface CreateEquipmentDependencies {
  equipment: EquipmentRepository;
  services: ServiceRepository;
  audit: AuditWriter;
  outbox: OutboxStore;
}

export class CreateEquipmentUseCase {
  constructor(private readonly dependencies: CreateEquipmentDependencies) {}

  async execute(context: ExecutionContext, input: CreateEquipmentInput): Promise<Equipment> {
    if (!context.tenantId) throw new Error("Tenant is required to create equipment.");
    const tenantId = context.tenantId;
    const serviceIds = [...new Set(input.serviceIds ?? [])];

    for (const serviceId of serviceIds) {
      const service = await this.dependencies.services.findById(tenantId, serviceId);
      if (!service) throw new NotFoundError("service", serviceId);
    }

    const equipment = createEquipment({ ...input, tenantId, serviceIds });
    await this.dependencies.equipment.create(equipment);
    await this.dependencies.audit.append(createAuditEvent(context, {
      action: AuditActions.EquipmentCreated,
      resource: { type: "equipment", id: equipment.id },
      metadata: { serviceIds: equipment.serviceIds, status: equipment.status },
    }));
    await this.dependencies.outbox.append(createOutboxEvent({
      tenantId,
      type: "equipment.created",
      aggregateType: "equipment",
      aggregateId: equipment.id,
      correlationId: context.correlationId,
      payload: { equipmentId: equipment.id },
    }));
    return equipment;
  }
}

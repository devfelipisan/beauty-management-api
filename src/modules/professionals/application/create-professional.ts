import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { ForbiddenError, NotFoundError, createEntityId, nowIso } from "@/shared/domain/core";
import type { Professional } from "@/shared/domain/models";
import { createOutboxEvent } from "@/shared/outbox/outbox";

export interface CreateProfessionalInput {
  displayName: string;
  specialty?: string;
  serviceIds?: string[];
  active?: boolean;
}

export class CreateProfessionalUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(context: ExecutionContext, input: CreateProfessionalInput): Promise<Professional> {
    if (!context.tenantId) throw new Error("Tenant is required to create a professional.");
    const tenantId = context.tenantId;
    const serviceIds = [...new Set(input.serviceIds ?? [])];
    if (input.active && serviceIds.length === 0) {
      throw new ForbiddenError("PROFESSIONAL_SERVICE_REQUIRED", "An active professional must be linked to at least one service.");
    }

    return this.unitOfWork.execute(context, async (transaction) => {
      for (const serviceId of serviceIds) {
        const service = await transaction.services.findById(tenantId, serviceId);
        if (!service) throw new NotFoundError("service", serviceId);
      }

      const professional: Professional = {
        id: createEntityId(),
        tenantId,
        displayName: input.displayName.trim(),
        specialty: input.specialty?.trim() || undefined,
        serviceIds,
        active: input.active ?? false,
        createdAt: nowIso(),
      };
      if (professional.displayName.length < 2) throw new Error("Professional name is required.");

      await transaction.professionals.create(professional);
      for (const serviceId of serviceIds) {
        const service = await transaction.services.findById(tenantId, serviceId);
        if (service && !service.professionalIds.includes(professional.id)) {
          await transaction.services.update({ ...service, professionalIds: [...service.professionalIds, professional.id] });
        }
      }
      await transaction.audit.append(createAuditEvent(context, {
        action: AuditActions.ProfessionalCreated,
        resource: { type: "professional", id: professional.id },
        metadata: { active: professional.active, serviceIds },
      }));
      await transaction.outbox.append(createOutboxEvent({
        tenantId,
        type: "professional.created",
        aggregateType: "professional",
        aggregateId: professional.id,
        correlationId: context.correlationId,
        payload: { professionalId: professional.id },
      }));
      return professional;
    });
  }
}

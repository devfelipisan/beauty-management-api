import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { NotFoundError } from "@/shared/domain/core";
import { createOutboxEvent } from "@/shared/outbox/outbox";
import { createPackage, type CustomerPackage } from "../domain/package";
import type { PackageRepository } from "../domain/package-repository";

export interface CreatePackageInput {
  customerId: string;
  serviceId: string;
  totalSessions: number;
  validUntil?: string;
  priceCents?: number;
}

export class CreatePackageUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly packages: PackageRepository,
  ) {}

  async execute(context: ExecutionContext, input: CreatePackageInput): Promise<CustomerPackage> {
    if (!context.tenantId) throw new Error("Tenant is required to create a package.");
    const tenantId = context.tenantId;

    return this.unitOfWork.execute(context, async (transaction) => {
      const [customer, service] = await Promise.all([
        transaction.customers.findById(tenantId, input.customerId),
        transaction.services.findById(tenantId, input.serviceId),
      ]);
      if (!customer) throw new NotFoundError("customer", input.customerId);
      if (!service) throw new NotFoundError("service", input.serviceId);

      const entity = createPackage({ tenantId, ...input });
      await this.packages.create(entity);
      await transaction.audit.append(createAuditEvent(context, {
        action: AuditActions.PackageCreated,
        resource: { type: "package", id: entity.id },
        metadata: { customerId: entity.customerId, serviceId: entity.serviceId, totalSessions: entity.totalSessions },
      }));
      await transaction.outbox.append(createOutboxEvent({
        tenantId,
        type: "package.created",
        aggregateType: "package",
        aggregateId: entity.id,
        correlationId: context.correlationId,
        payload: { packageId: entity.id, customerId: entity.customerId },
      }));
      return entity;
    });
  }
}

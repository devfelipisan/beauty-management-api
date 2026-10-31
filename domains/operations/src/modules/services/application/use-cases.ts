import { Service, ServiceStatus } from '../domain/service.js';
import type { ServiceRepository } from '../ports/service-repository.js';
import type { UnitOfWork } from '@beauty/reliability/unit-of-work/unit-of-work';
import {
  auditedMutation,
  type MutationAuditContext,
} from '@beauty/reliability/audit/audited-mutation';

const page = (limit = 20) => Math.min(Math.max(limit, 1), 100);
function assertPhotographyAvailable(
  input: {
    requiresPhotography?: boolean;
    technicalRequirements?: Record<string, unknown>;
  },
  available?: boolean,
) {
  if (
    available === false &&
    (input.requiresPhotography === true ||
      input.technicalRequirements?.requiresPhotography === true)
  )
    throw new Error('CLINICAL_MEDIA_UNAVAILABLE');
}
function audit(item: Service, action: string) {
  return {
    tenantId: item.data.tenantId,
    action,
    resourceType: 'SERVICE',
    resourceId: item.id,
    occurredAt: item.data.updatedAt,
  };
}
export class CreateServiceUseCase {
  constructor(
    private readonly repo: ServiceRepository,
    private readonly clinicalPhotographyAvailable?: boolean,
    private readonly uow?: UnitOfWork,
  ) {}
  async execute(
    input: Parameters<typeof Service.create>[1],
    context?: MutationAuditContext,
  ) {
    assertPhotographyAvailable(input, this.clinicalPhotographyAvailable);
    const item = Service.create(crypto.randomUUID(), input);
    return auditedMutation(
      this.uow,
      context,
      audit(item, 'service.created'),
      async (transaction) => {
        await this.repo.create(item, transaction);
        return item;
      },
    );
  }
}
export class GetServiceUseCase {
  constructor(private readonly repo: ServiceRepository) {}
  execute(tenantId: string, id: string) {
    return this.repo.findById(tenantId, id);
  }
}
export class ListServicesUseCase {
  constructor(private readonly repo: ServiceRepository) {}
  execute(tenantId: string, limit?: number, cursor?: string) {
    return this.repo.list(tenantId, page(limit), cursor);
  }
}
export class UpdateServiceUseCase {
  constructor(
    private readonly repo: ServiceRepository,
    private readonly clinicalPhotographyAvailable?: boolean,
    private readonly uow?: UnitOfWork,
  ) {}
  async execute(
    tenantId: string,
    id: string,
    input: Parameters<typeof Service.create>[1],
    context?: MutationAuditContext,
  ) {
    assertPhotographyAvailable(input, this.clinicalPhotographyAvailable);
    const item = await this.repo.findById(tenantId, id);
    if (!item) return null;
    const previousUpdatedAt = item.data.updatedAt;
    item.update(input);
    return auditedMutation(
      this.uow,
      context,
      audit(item, 'service.updated'),
      async (transaction) => {
        await this.repo.update(item, transaction, previousUpdatedAt);
        return item;
      },
    );
  }
}
export class DeactivateServiceUseCase {
  constructor(
    private readonly repo: ServiceRepository,
    private readonly uow?: UnitOfWork,
  ) {}
  async execute(tenantId: string, id: string, context?: MutationAuditContext) {
    const item = await this.repo.findById(tenantId, id);
    if (!item) return null;
    const previousUpdatedAt = item.data.updatedAt;
    item.changeStatus(ServiceStatus.INACTIVE);
    return auditedMutation(
      this.uow,
      context,
      audit(item, 'service.deactivated'),
      async (transaction) => {
        await this.repo.update(item, transaction, previousUpdatedAt);
        return item;
      },
    );
  }
}

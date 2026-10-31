import type { UnitOfWork } from '@beauty/reliability/unit-of-work/unit-of-work';
import {
  auditedMutation,
  type MutationAuditContext,
} from '@beauty/reliability/audit/audited-mutation';
import { Customer, CustomerStatus } from '../domain/customer.js';
import type { CustomerRepository } from '../ports/customer-repository.js';
const page = (limit = 20) => Math.min(Math.max(limit, 1), 100);
export class CreateCustomerUseCase {
  constructor(private readonly repo: CustomerRepository) {}
  async execute(input: Parameters<typeof Customer.create>[1]) {
    const item = Customer.create(crypto.randomUUID(), input);
    const duplicate =
      (item.data.phone &&
        (await this.repo.findByPhone(item.data.tenantId, item.data.phone))) ||
      (item.data.document &&
        (await this.repo.findByDocument(
          item.data.tenantId,
          item.data.document,
        ))) ||
      (item.data.email &&
        (await this.repo.findByEmail(item.data.tenantId, item.data.email)));
    if (duplicate) throw new Error('CUSTOMER_DUPLICATE_CANDIDATE');
    await this.repo.create(item);
    return item;
  }
}
export class GetCustomerUseCase {
  constructor(private readonly repo: CustomerRepository) {}
  execute(tenantId: string, id: string) {
    return this.repo.findById(tenantId, id);
  }
}
export class ListCustomersUseCase {
  constructor(private readonly repo: CustomerRepository) {}
  execute(tenantId: string, limit?: number, cursor?: string) {
    return this.repo.list(tenantId, page(limit), cursor);
  }
}
export class UpdateCustomerUseCase {
  constructor(
    private readonly repo: CustomerRepository,
    private readonly uow?: UnitOfWork,
  ) {}
  async execute(
    tenantId: string,
    id: string,
    input: Parameters<typeof Customer.create>[1],
    context?: MutationAuditContext,
  ) {
    const item = await this.repo.findById(tenantId, id);
    if (!item) return null;
    const previousUpdatedAt = item.data.updatedAt;
    item.update(input);
    return auditedMutation(
      this.uow,
      context,
      {
        tenantId,
        action: 'customer.updated',
        resourceType: 'CUSTOMER',
        resourceId: id,
        occurredAt: item.data.updatedAt,
      },
      async (transaction) => {
        await this.repo.update(item, transaction, previousUpdatedAt);
        return item;
      },
    );
  }
}
export class DeactivateCustomerUseCase {
  constructor(private readonly repo: CustomerRepository) {}
  async execute(tenantId: string, id: string) {
    const item = await this.repo.findById(tenantId, id);
    if (!item) return null;
    item.changeStatus(CustomerStatus.INACTIVE);
    await this.repo.update(item);
    return item;
  }
}

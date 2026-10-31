import type { Service } from '../domain/service.js';
import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
export interface ServiceRepository {
  findById(tenantId: string, id: string): Promise<Service | null>;
  list(tenantId: string, limit: number, cursor?: string): Promise<Service[]>;
  create(
    service: Service,
    transaction?: TransactionalWriteContext,
  ): Promise<void>;
  update(
    service: Service,
    transaction?: TransactionalWriteContext,
    previousUpdatedAt?: string,
  ): Promise<void>;
}
export const SERVICE_REPOSITORY = Symbol('SERVICE_REPOSITORY');

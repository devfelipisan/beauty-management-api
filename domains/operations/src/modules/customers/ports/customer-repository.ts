import type { Customer } from '../domain/customer.js';
import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
export interface CustomerRepository {
  findById(tenantId: string, id: string): Promise<Customer | null>;
  findByPhone(tenantId: string, phone: string): Promise<Customer | null>;
  findByDocument(tenantId: string, document: string): Promise<Customer | null>;
  findByEmail(tenantId: string, email: string): Promise<Customer | null>;
  list(tenantId: string, limit: number, cursor?: string): Promise<Customer[]>;
  create(
    customer: Customer,
    transaction?: TransactionalWriteContext,
  ): Promise<void>;
  update(
    customer: Customer,
    transaction?: TransactionalWriteContext,
    previousUpdatedAt?: string,
  ): Promise<void>;
}
export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

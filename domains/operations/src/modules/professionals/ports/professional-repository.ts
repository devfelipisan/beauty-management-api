import type { Professional } from '../domain/professional.js';
import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
export interface ProfessionalRepository {
  findById(tenantId: string, id: string): Promise<Professional | null>;
  list(
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<Professional[]>;
  create(
    professional: Professional,
    transaction?: TransactionalWriteContext,
  ): Promise<void>;
  update(professional: Professional): Promise<void>;
}
export const PROFESSIONAL_REPOSITORY = Symbol('PROFESSIONAL_REPOSITORY');

import type { DemoCatalogInput } from '@beauty/contracts';
import { Customer } from '../../customers/domain/customer.js';
import { Professional, ProfessionalStatus } from '../../professionals/domain/professional.js';
import { Service, ServiceStatus } from '../../services/domain/service.js';
import type { CustomerRepository } from '../../customers/ports/customer-repository.js';
import type { ProfessionalRepository } from '../../professionals/ports/professional-repository.js';
import type { ServiceRepository } from '../../services/ports/service-repository.js';
import type { UnitOfWork } from '@beauty/reliability/unit-of-work/unit-of-work';
import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
import type { IdempotencyStore } from '@beauty/reliability/idempotency/idempotency-store';
import { IdempotencyService } from '@beauty/reliability/idempotency/idempotency.service';

export interface DemoCatalogLinks {
  stage(transaction: TransactionalWriteContext, tenantId: string, professionalId: string, serviceId: string, at: string): void;
}
export interface DemoCommandContext {
  tenantId: string; role: string; professionalId?: string; permissions: string[];
  idempotencyKey: string; sessionId: string; requestId: string; correlationId: string;
}

/** Demo changes use the same entities, repositories and atomic persistence as normal operations. */
export class CreateDemoCatalog {
  constructor(private readonly customers: CustomerRepository, private readonly professionals: ProfessionalRepository,
    private readonly services: ServiceRepository, private readonly links: DemoCatalogLinks,
    private readonly uow: UnitOfWork, private readonly store: IdempotencyStore) {}

  async execute(input: DemoCatalogInput, context: DemoCommandContext): Promise<Record<string, unknown>> {
    const permission = input.kind === 'customers' ? 'customer.create' : input.kind === 'professionals' ? 'professional.create' : 'service.create';
    if (context.professionalId || !context.permissions.includes(permission)) throw new Error('PERMISSION_DENIED');
    const operation = `DEMO_${permission}`;
    const idempotency = new IdempotencyService();
    return this.uow.execute(async transaction => {
      const idem = await idempotency.reserveOrReplay({
        find: (t, o, k) => this.store.find(t, o, k),
        reserve: record => transaction.idempotency.reserve(record),
        complete: (t, o, k, response) => transaction.idempotency.complete(t, o, k, response),
        fail: (t, o, k) => transaction.idempotency.fail(t, o, k),
      }, context.tenantId, operation, context.idempotencyKey, { input, role: context.role, sessionId: context.sessionId });
      if (idem.replay) return idem.record.response as Record<string, unknown>;
      const tenantId = context.tenantId;
      const id = crypto.randomUUID();
      let response: Record<string, unknown>;
      if (input.kind === 'customers') {
        if (await this.customers.findByPhone(tenantId, input.phone) || (input.email && await this.customers.findByEmail(tenantId, input.email))) throw new Error('CUSTOMER_DUPLICATE_CANDIDATE');
        const customer = Customer.create(id, { tenantId, fullName: input.fullName, phone: input.phone, email: input.email });
        await this.customers.create(customer, transaction.persistence);
        response = { id, ...customer.data };
      } else if (input.kind === 'professionals') {
        if (input.active && input.serviceIds.length === 0) throw new Error('PROFESSIONAL_INVALID');
        for (const serviceId of input.serviceIds) if (!await this.services.findById(tenantId, serviceId)) throw new Error('CROSS_TENANT_RELATION_FORBIDDEN');
        const professional = Professional.create(id, { tenantId, name: input.displayName, specialty: input.specialty, publicVisible: false,
          status: input.active ? ProfessionalStatus.ACTIVE : ProfessionalStatus.INACTIVE });
        await this.professionals.create(professional, transaction.persistence);
        for (const serviceId of input.serviceIds) this.links.stage(transaction.persistence, tenantId, id, serviceId, professional.data.createdAt);
        response = { id, ...professional.data, serviceIds: input.serviceIds };
      } else {
        for (const professionalId of input.professionalIds) if (!await this.professionals.findById(tenantId, professionalId)) throw new Error('CROSS_TENANT_RELATION_FORBIDDEN');
        const service = Service.create(id, { tenantId, name: input.name, category: input.category, durationMinutes: input.durationMinutes,
          basePriceCents: input.priceCents, status: input.active ? ServiceStatus.ACTIVE : ServiceStatus.INACTIVE,
          requiresAssessment: input.assessmentRequired,
          depositMode: input.deposit.type === 'fixed' ? 'FIXED' : input.deposit.type === 'percentage' ? 'PERCENTAGE' : 'NOT_REQUIRED',
          depositFixedCents: input.deposit.type === 'fixed' ? input.deposit.value : undefined,
          depositPercentageBasisPoints: input.deposit.type === 'percentage' ? Math.round(input.deposit.value * 100) : undefined });
        await this.services.create(service, transaction.persistence);
        for (const professionalId of input.professionalIds) this.links.stage(transaction.persistence, tenantId, professionalId, id, service.data.createdAt);
        response = { id, ...service.data, professionalIds: input.professionalIds };
      }
      await transaction.audit.append({ id: crypto.randomUUID(), tenantId, action: permission,
        resourceType: input.kind.toUpperCase(), resourceId: id, requestId: context.requestId, correlationId: context.correlationId,
        occurredAt: new Date().toISOString(), metadata: { mode: 'demo', actorType: 'system', sessionId: context.sessionId, selectedRole: context.role } });
      await transaction.idempotency.complete(tenantId, operation, context.idempotencyKey, response);
      return response;
    }).catch(async (error: unknown) => {
      // A competing batch may have committed this key while this batch rolled back.
      const existing = await this.store.find(context.tenantId, operation, context.idempotencyKey);
      if (existing) {
        if (existing.requestHash !== idempotency.hash({ input, role: context.role, sessionId: context.sessionId })) throw new Error('IDEMPOTENCY_KEY_CONFLICT');
        if (existing.status === 'COMPLETED') return existing.response as Record<string, unknown>;
      }
      throw error;
    });
  }
}

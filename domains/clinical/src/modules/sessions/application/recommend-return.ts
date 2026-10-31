import { assertProfessionalAuthorization } from '@beauty/kernel/application/actor-authorization';
import type {
  RecommendReturnRequest,
  ReturnRecommendedEvent,
} from '@beauty/contracts';
import type { SessionRepository } from '../ports/session-repository.js';
import type { UnitOfWork } from '@beauty/reliability/unit-of-work/unit-of-work';
import type { IdempotencyStore } from '@beauty/reliability/idempotency/idempotency-store';
import { IdempotencyService } from '@beauty/reliability/idempotency/idempotency.service';
const tx = (s: IdempotencyStore, t: any): IdempotencyStore => ({
  find: (a, b, c) => s.find(a, b, c),
  reserve: (r) => t.idempotency.reserve(r),
  complete: (a, b, c, d) => t.idempotency.complete(a, b, c, d),
  fail: (a, b, c) => t.idempotency.fail(a, b, c),
});
export class RecommendReturn {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly uow: UnitOfWork,
    private readonly store: IdempotencyStore,
    private readonly idem = new IdempotencyService(),
  ) {}
  async execute(i: RecommendReturnRequest) {
    const s = await this.sessions.findById(i.tenantId, i.sessionId);
    if (!s) throw new Error('SESSION_NOT_FOUND');
    if (s.data.status !== 'COMPLETED')
      throw new Error('RETURN_RECOMMENDATION_REQUIRES_COMPLETED_SESSION');
    assertProfessionalAuthorization(i, s.data.professionalId);
    return this.uow.execute(async (t) => {
      const r = await this.idem.reserveOrReplay(
        tx(this.store, t),
        i.tenantId,
        'RECOMMEND_RETURN',
        i.idempotencyKey,
        i,
      );
      if (r.replay) return r.record.response;
      const now = new Date().toISOString();
      const response = {
        required: i.required,
        sessionId: i.sessionId,
        status: i.required ? 'PENDING' : ('NOT_REQUIRED' as const),
      };
      if (i.required) {
        const event: ReturnRecommendedEvent = {
          eventId: crypto.randomUUID(),
          tenantId: i.tenantId,
          sessionId: i.sessionId,
          customerId: s.data.customerId,
          serviceId: s.data.serviceId,
          professionalId: s.data.professionalId,
          recommendedFor: i.recommendedFor,
          interval: i.interval,
          reasonCode: i.reasonCode,
          correlationId: i.correlationId,
        };
        await t.outbox.append({
          id: event.eventId,
          tenantId: i.tenantId,
          type: 'ReturnRecommended',
          aggregateType: 'SESSION',
          aggregateId: i.sessionId,
          correlationId: i.correlationId,
          payload: event as unknown as Record<string, unknown>,
          status: 'PENDING',
          createdAt: now,
        });
      }
      await t.audit.append({
        id: crypto.randomUUID(),
        tenantId: i.tenantId,
        actorId: i.actorId,
        action: 'return.recommended',
        resourceType: 'SESSION',
        resourceId: i.sessionId,
        requestId: i.requestId,
        correlationId: i.correlationId,
        occurredAt: now,
        metadata: {
          required: i.required,
          sessionId: i.sessionId,
          recommendedFor: i.recommendedFor,
        },
      });
      await t.idempotency.complete(
        i.tenantId,
        'RECOMMEND_RETURN',
        i.idempotencyKey,
        response,
      );
      return response;
    });
  }
}

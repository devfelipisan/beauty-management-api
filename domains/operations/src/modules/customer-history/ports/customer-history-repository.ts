import type {
  CustomerHistoryPage,
  CustomerHistoryQuery,
  CustomerTimelineEvent,
  ReturnRecommendation,
} from '@beauty/contracts';
import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';

export interface CustomerHistoryRepository {
  list(q: CustomerHistoryQuery): Promise<CustomerHistoryPage>;
  append(e: CustomerTimelineEvent, tx: TransactionalWriteContext): void;
  incrementStats(
    tenantId: string,
    customerId: string,
    at: string,
    tx: TransactionalWriteContext,
  ): void;
  promoteNewCustomer(
    tenantId: string,
    customerId: string,
    at: string,
    tx: TransactionalWriteContext,
  ): void;
  appendProfileHistory(
    tenantId: string,
    customerId: string,
    eventId: string,
    at: string,
    tx: TransactionalWriteContext,
  ): void;
  createReturn(
    r: ReturnRecommendation,
    sourceEventId: string,
    tx: TransactionalWriteContext,
  ): void;
  listReturns(q: {
    tenantId: string;
    status?: string;
    dueFrom?: string;
    dueTo?: string;
    customerId?: string;
    professionalId?: string;
    serviceId?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    items: {
      id: any;
      tenantId: any;
      customerId: any;
      sessionId: any;
      serviceId: any;
      professionalId: any;
      status: any;
      recommendedAt: any;
      recommendedFor: any;
      intervalValue: any;
      intervalUnit: any;
      reasonCode: any;
      observation: any;
      appointmentId: any;
      createdAt: any;
      convertedAt: any;
      overdue: boolean;
    }[];
    nextCursor: any;
  }>;
}

export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'PUBLISHED' | 'FAILED';
export interface OutboxEvent { id: string; tenantId?: string; type: string; aggregateType: string; aggregateId: string; correlationId: string; payload: Record<string, unknown>; status: OutboxStatus; createdAt: string; publishedAt?: string; }

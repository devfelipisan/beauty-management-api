export type IdempotencyStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';
export interface IdempotencyRecord { id: string; tenantId: string; operation: string; key: string; requestHash: string; status: IdempotencyStatus; response?: unknown; createdAt: string; updatedAt: string; expiresAt?: string; }

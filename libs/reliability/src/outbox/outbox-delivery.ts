import type { OutboxEvent } from './outbox-event.js';

export type DeliveryResult =
  | { kind: 'DELIVERED' }
  | { kind: 'RETRYABLE'; errorCode: string }
  | { kind: 'PERMANENT'; errorCode: string };

export interface DeliveryPort { deliver(event: OutboxEvent): Promise<DeliveryResult>; }

export interface OutboxDeliveryRepository {
  findDispatchable(batchSize: number, now: string): Promise<OutboxEvent[]>;
  claim(eventId: string, workerId: string, now: string, leaseSeconds: number): Promise<boolean>;
  markSent(eventId: string, workerId: string, sentAt: string): Promise<boolean>;
  releaseForRetry(eventId: string, workerId: string, availableAt: string, errorCode: string, errorAt: string): Promise<boolean>;
  markDead(eventId: string, workerId: string, errorCode: string, errorAt: string): Promise<boolean>;
  recoverExpiredClaims(now: string): Promise<number>;
}

import { createEntityId, nowIso, type EntityId, type IsoDateTime } from "@/shared/domain/core";

export type OutboxStatus = "pending" | "processing" | "published" | "failed";

export interface OutboxEvent {
  id: EntityId;
  tenantId?: EntityId;
  type: string;
  aggregateType: string;
  aggregateId: EntityId;
  correlationId: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  createdAt: IsoDateTime;
  publishedAt?: IsoDateTime;
  lastError?: string;
}

export interface OutboxWriter {
  append(event: OutboxEvent): Promise<void>;
}

export interface OutboxReader {
  findPending(limit?: number): Promise<OutboxEvent[]>;
}

export interface OutboxStateWriter {
  markProcessing(id: EntityId): Promise<void>;
  markPublished(id: EntityId): Promise<void>;
  markFailed(id: EntityId, error: string): Promise<void>;
}

export type OutboxStore = OutboxWriter & OutboxReader & OutboxStateWriter;

export interface OutboxPublisher {
  publish(event: OutboxEvent): Promise<void>;
}

export function createOutboxEvent(input: Omit<OutboxEvent, "id" | "status" | "attempts" | "createdAt">): OutboxEvent {
  return {
    ...input,
    id: createEntityId(),
    status: "pending",
    attempts: 0,
    createdAt: nowIso(),
  };
}

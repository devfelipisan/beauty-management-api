import type { EntityId, IsoDateTime } from "@/shared/domain/core";

export type IdempotencyStatus = "processing" | "completed" | "failed";

export interface IdempotencyRecord {
  id: EntityId;
  tenantId: EntityId;
  key: string;
  operation: string;
  requestHash: string;
  status: IdempotencyStatus;
  response?: unknown;
  expiresAt: IsoDateTime;
}

export interface IdempotencyStore {
  find(tenantId: EntityId, operation: string, key: string): Promise<IdempotencyRecord | null>;
  reserve(record: IdempotencyRecord): Promise<void>;
  complete(tenantId: EntityId, operation: string, key: string, response: unknown): Promise<void>;
  fail(tenantId: EntityId, operation: string, key: string): Promise<void>;
}

export function stableRequestHash(value: unknown): string {
  const normalized = JSON.stringify(sortObject(value));
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortObject(nested)]),
  );
}

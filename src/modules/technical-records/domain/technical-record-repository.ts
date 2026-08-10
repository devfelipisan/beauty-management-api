import type { TechnicalRecord } from "./technical-record";

export interface TechnicalRecordRepository {
  findById(tenantId: string, id: string): Promise<TechnicalRecord | null>;
  listBySession(tenantId: string, sessionId: string): Promise<TechnicalRecord[]>;
  create(entity: TechnicalRecord): Promise<TechnicalRecord>;
}

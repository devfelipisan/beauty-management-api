import type { Assessment } from "@/modules/assessments/domain/assessment";
import type { AssessmentRepository } from "@/modules/assessments/domain/assessment-repository";
import type { FollowUp } from "@/modules/follow-ups/domain/follow-up";
import type { FollowUpRepository } from "@/modules/follow-ups/domain/follow-up-repository";
import type { TechnicalRecord } from "@/modules/technical-records/domain/technical-record";
import type { TechnicalRecordRepository } from "@/modules/technical-records/domain/technical-record-repository";

function replaceById<T extends { id: string }>(items: T[], entity: T): T {
  const index = items.findIndex((item) => item.id === entity.id);
  if (index < 0) throw new Error(`Entity ${entity.id} was not found for update.`);
  items[index] = entity;
  return entity;
}

export class MemoryAssessmentRepository implements AssessmentRepository {
  private readonly items: Assessment[];
  constructor(initialItems: Assessment[] = []) { this.items = initialItems.map((item) => ({ ...item, restrictions: [...item.restrictions] })); }
  async findById(tenantId: string, id: string) { return this.items.find((item) => item.tenantId === tenantId && item.id === id) ?? null; }
  async listByCustomer(tenantId: string, customerId: string) { return this.items.filter((item) => item.tenantId === tenantId && item.customerId === customerId); }
  async create(entity: Assessment) { this.items.push(entity); return entity; }
}

export class MemoryTechnicalRecordRepository implements TechnicalRecordRepository {
  private readonly items: TechnicalRecord[];
  constructor(initialItems: TechnicalRecord[] = []) { this.items = initialItems.map((item) => ({ ...item })); }
  async findById(tenantId: string, id: string) { return this.items.find((item) => item.tenantId === tenantId && item.id === id) ?? null; }
  async listBySession(tenantId: string, sessionId: string) { return this.items.filter((item) => item.tenantId === tenantId && item.sessionId === sessionId); }
  async create(entity: TechnicalRecord) { this.items.push(entity); return entity; }
}

export class MemoryFollowUpRepository implements FollowUpRepository {
  private readonly items: FollowUp[];
  constructor(initialItems: FollowUp[] = []) { this.items = initialItems.map((item) => ({ ...item })); }
  async findById(tenantId: string, id: string) { return this.items.find((item) => item.tenantId === tenantId && item.id === id) ?? null; }
  async list(tenantId: string) { return this.items.filter((item) => item.tenantId === tenantId).sort((a, b) => a.suggestedAt.localeCompare(b.suggestedAt)); }
  async create(entity: FollowUp) { this.items.push(entity); return entity; }
  async update(entity: FollowUp) { return replaceById(this.items, entity); }
}

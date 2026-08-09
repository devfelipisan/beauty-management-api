import type { EntityId } from "@/shared/domain/core";
import type { Lead } from "./lead";

export interface LeadRepository {
  findById(tenantId: EntityId, id: EntityId): Promise<Lead | null>;
  findPotentialDuplicates(tenantId: EntityId, input: Pick<Lead, "phone" | "email">): Promise<Lead[]>;
  list(tenantId: EntityId): Promise<Lead[]>;
  create(entity: Lead): Promise<Lead>;
  update(entity: Lead): Promise<Lead>;
}

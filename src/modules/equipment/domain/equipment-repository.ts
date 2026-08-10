import type { EntityId } from "@/shared/domain/core";
import type { Equipment } from "./equipment";

export interface EquipmentRepository {
  findById(tenantId: EntityId, id: EntityId): Promise<Equipment | null>;
  list(tenantId: EntityId): Promise<Equipment[]>;
  create(entity: Equipment): Promise<Equipment>;
  update(entity: Equipment): Promise<Equipment>;
}

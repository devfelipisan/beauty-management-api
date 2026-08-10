import type { EntityId } from "@/shared/domain/core";
import type { CustomerPackage } from "./package";

export interface PackageRepository {
  findById(tenantId: EntityId, id: EntityId): Promise<CustomerPackage | null>;
  list(tenantId: EntityId): Promise<CustomerPackage[]>;
  create(entity: CustomerPackage): Promise<CustomerPackage>;
  update(entity: CustomerPackage): Promise<CustomerPackage>;
}

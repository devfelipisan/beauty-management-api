import type { CustomerPackage } from "../domain/package";
import type { PackageRepository } from "../domain/package-repository";

export class MemoryPackageRepository implements PackageRepository {
  private readonly items: CustomerPackage[];

  constructor(initialItems: CustomerPackage[] = []) {
    this.items = initialItems.map((item) => ({ ...item }));
  }

  async findById(tenantId: string, id: string) {
    return this.items.find((item) => item.tenantId === tenantId && item.id === id) ?? null;
  }

  async list(tenantId: string) {
    return this.items.filter((item) => item.tenantId === tenantId).map((item) => ({ ...item }));
  }

  async create(entity: CustomerPackage) {
    this.items.push({ ...entity });
    return entity;
  }

  async update(entity: CustomerPackage) {
    const index = this.items.findIndex((item) => item.tenantId === entity.tenantId && item.id === entity.id);
    if (index < 0) throw new Error(`Package ${entity.id} was not found for update.`);
    this.items[index] = { ...entity };
    return entity;
  }
}

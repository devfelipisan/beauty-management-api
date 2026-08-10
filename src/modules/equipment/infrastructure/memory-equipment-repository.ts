import type { Equipment } from "../domain/equipment";
import type { EquipmentRepository } from "../domain/equipment-repository";

export class MemoryEquipmentRepository implements EquipmentRepository {
  private readonly items: Equipment[] = [];

  async findById(tenantId: string, id: string) {
    return this.items.find((item) => item.tenantId === tenantId && item.id === id) ?? null;
  }

  async list(tenantId: string) {
    return this.items.filter((item) => item.tenantId === tenantId).map((item) => ({ ...item, serviceIds: [...item.serviceIds] }));
  }

  async create(entity: Equipment) {
    this.items.push({ ...entity, serviceIds: [...entity.serviceIds] });
    return entity;
  }

  async update(entity: Equipment) {
    const index = this.items.findIndex((item) => item.tenantId === entity.tenantId && item.id === entity.id);
    if (index < 0) throw new Error(`Equipment ${entity.id} was not found for update.`);
    this.items[index] = { ...entity, serviceIds: [...entity.serviceIds] };
    return entity;
  }
}

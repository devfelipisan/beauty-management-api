import type { TenantUser } from "../domain/user";
import type { TenantUserRepository } from "../domain/user-repository";

function copy(user: TenantUser): TenantUser {
  return { ...user };
}

/** Test double only. Production persistence is PostgreSQL. */
export class MemoryTenantUserRepository implements TenantUserRepository {
  private readonly items: TenantUser[];

  constructor(initial: TenantUser[] = []) {
    this.items = initial.map(copy);
  }

  async findById(tenantId: string, id: string) {
    const item = this.items.find((candidate) => candidate.tenantId === tenantId && candidate.id === id);
    return item ? copy(item) : null;
  }

  async findByEmail(tenantId: string, email: string) {
    const normalized = email.trim().toLowerCase();
    const item = this.items.find((candidate) => candidate.tenantId === tenantId && candidate.email.toLowerCase() === normalized);
    return item ? copy(item) : null;
  }

  async list(tenantId: string) {
    return this.items.filter((candidate) => candidate.tenantId === tenantId).map(copy);
  }

  async create(entity: TenantUser) {
    this.items.push(copy(entity));
    return copy(entity);
  }

  async update(entity: TenantUser) {
    const index = this.items.findIndex((candidate) => candidate.tenantId === entity.tenantId && candidate.id === entity.id);
    if (index < 0) throw new Error(`User ${entity.id} was not found for update.`);
    this.items[index] = copy(entity);
    return copy(entity);
  }
}

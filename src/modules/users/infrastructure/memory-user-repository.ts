import type { TenantUser } from "../domain/user";
import type { TenantUserRepository } from "../domain/user-repository";

const createdAt = "2026-08-09T12:00:00.000Z";

const demoUsers: TenantUser[] = [
  {
    id: "user-tenant-admin",
    tenantId: "tenant-bella",
    fullName: "Marina Souza",
    email: "admin@bella.local",
    phone: "22999990010",
    profile: "administrator",
    status: "active",
    lastAccessAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: "user-reception",
    tenantId: "tenant-bella",
    fullName: "Carla Mendes",
    email: "recepcao@bella.local",
    phone: "22999990011",
    profile: "reception",
    status: "active",
    lastAccessAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: "user-professional",
    tenantId: "tenant-bella",
    fullName: "Ana Martins",
    email: "ana@bella.local",
    phone: "22999990012",
    profile: "professional",
    status: "active",
    lastAccessAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  },
];

function copy(user: TenantUser): TenantUser {
  return { ...user };
}

export class MemoryTenantUserRepository implements TenantUserRepository {
  private readonly items = demoUsers.map(copy);

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

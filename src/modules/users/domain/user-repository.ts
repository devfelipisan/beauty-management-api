import type { TenantUser } from "./user";

export interface TenantUserRepository {
  findById(tenantId: string, id: string): Promise<TenantUser | null>;
  findByEmail(tenantId: string, email: string): Promise<TenantUser | null>;
  list(tenantId: string): Promise<TenantUser[]>;
  create(entity: TenantUser): Promise<TenantUser>;
  update(entity: TenantUser): Promise<TenantUser>;
}

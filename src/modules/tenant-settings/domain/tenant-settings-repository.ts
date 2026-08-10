import type { TenantSettings } from "./tenant-settings";

export interface TenantSettingsRepository {
  findByTenantId(tenantId: string): Promise<TenantSettings | null>;
  save(settings: TenantSettings): Promise<TenantSettings>;
}

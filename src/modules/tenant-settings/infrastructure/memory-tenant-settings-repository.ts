import type { TenantSettingsRepository } from "../domain/tenant-settings-repository";
import type { TenantSettings } from "../domain/tenant-settings";

export class MemoryTenantSettingsRepository implements TenantSettingsRepository {
  private readonly items = new Map<string, TenantSettings>();

  async findByTenantId(tenantId: string) {
    return this.items.get(tenantId) ?? null;
  }

  async save(settings: TenantSettings) {
    this.items.set(settings.tenantId, structuredClone(settings));
    return settings;
  }
}

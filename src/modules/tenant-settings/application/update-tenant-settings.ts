import type { ExecutionContext } from "@/shared/application/execution-context";
import { nowIso } from "@/shared/domain/core";
import type { TenantSettingsRepository } from "../domain/tenant-settings-repository";
import type { TenantSettings, UpdateTenantSettingsInput } from "../domain/tenant-settings";

export class UpdateTenantSettingsUseCase {
  constructor(private readonly repository: TenantSettingsRepository) {}

  async execute(context: ExecutionContext, input: UpdateTenantSettingsInput): Promise<TenantSettings> {
    if (!context.tenantId) throw new Error("Tenant is required to update settings.");
    if (input.sessionTimeoutMinutes < 5 || input.sessionTimeoutMinutes > 1440) {
      throw new Error("sessionTimeoutMinutes must be between 5 and 1440.");
    }
    const current = await this.repository.findByTenantId(context.tenantId);
    const next: TenantSettings = {
      ...(current ?? {}),
      ...input,
      tenantId: context.tenantId,
      planName: current?.planName,
      licenseStatus: current?.licenseStatus,
      updatedAt: nowIso(),
    };
    return this.repository.save(next);
  }
}

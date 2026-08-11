import { normalizePublicTenantSlug } from "@/modules/tenants/domain/public-tenant-slug";
import { NotFoundError } from "@/shared/domain/core";
import type { TenantStatus } from "@/shared/domain/models";

export interface PublicTenantContext {
  tenantId: string;
  displayName: string;
  publicSlug: string;
  status: TenantStatus;
}

export interface PublicTenantContextRepository {
  findByPublicSlug(slug: string): Promise<PublicTenantContext | null>;
}

export class ResolvePublicTenantContextUseCase {
  constructor(private readonly repository: PublicTenantContextRepository) {}

  async execute(slug: string): Promise<PublicTenantContext> {
    const normalizedSlug = normalizePublicTenantSlug(slug);
    const tenant = await this.repository.findByPublicSlug(normalizedSlug);
    if (!tenant || (tenant.status !== "active" && tenant.status !== "trial")) {
      throw new NotFoundError("public_tenant", normalizedSlug);
    }
    return tenant;
  }
}

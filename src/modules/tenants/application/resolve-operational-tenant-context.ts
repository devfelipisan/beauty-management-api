import { DomainError, NotFoundError } from "@/shared/domain/core";
import type { TenantStatus } from "@/shared/domain/models";

export interface OperationalTenantContext {
  tenantId: string;
  displayName: string;
  publicSlug?: string;
  status: TenantStatus;
}

export interface OperationalTenantContextRepository {
  findById(tenantId: string): Promise<OperationalTenantContext | null>;
  listOperational(): Promise<OperationalTenantContext[]>;
}

function assertUuid(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new DomainError("TENANT_SELECTION_INVALID", "tenantId must be a valid UUID.", { field: "tenantId" });
  }
  return normalized;
}

function assertOperational(tenant: OperationalTenantContext): OperationalTenantContext {
  if (tenant.status === "suspended") throw new DomainError("TENANT_SUSPENDED", "The selected tenant is suspended.");
  if (tenant.status === "closed") throw new DomainError("TENANT_CLOSED", "The selected tenant is closed.");
  return tenant;
}

export class ResolveOperationalTenantContextUseCase {
  constructor(private readonly repository: OperationalTenantContextRepository) {}

  async execute(selection?: string): Promise<OperationalTenantContext> {
    if (selection) {
      const tenantId = assertUuid(selection);
      const tenant = await this.repository.findById(tenantId);
      if (!tenant) throw new NotFoundError("tenant", tenantId);
      return assertOperational(tenant);
    }

    const tenants = await this.repository.listOperational();
    if (tenants.length === 0) throw new NotFoundError("tenant", "operational");
    if (tenants.length > 1) {
      throw new DomainError("TENANT_SELECTION_REQUIRED", "A tenant selection is required because multiple operational tenants exist.", {
        tenantIds: tenants.map((tenant) => tenant.tenantId),
      });
    }
    return tenants[0];
  }
}

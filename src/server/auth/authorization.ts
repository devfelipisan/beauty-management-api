import type { PermissionCode } from "@/server/auth/permissions";
import type { TenantStatus } from "@/shared/domain/models";
import { DomainError } from "@/shared/domain/core";

export interface TenantAccess {
  actorId: string;
  authSubject: string;
  tenantId: string;
  tenantDisplayName: string;
  tenantPublicSlug?: string;
  tenantStatus: TenantStatus;
  membershipId: string;
  membershipStatus: "active" | "inactive" | "suspended";
  professionalId?: string;
  roles: string[];
  permissions: PermissionCode[];
}

export interface PlatformAccess {
  actorId: string;
  authSubject: string;
  roles: string[];
  permissions: PermissionCode[];
}

export interface AccessControlRepository {
  listTenantAccesses(authSubject: string): Promise<TenantAccess[]>;
  resolveTenantAccess(authSubject: string, tenantId: string): Promise<TenantAccess | null>;
  resolvePlatformAccess(authSubject: string): Promise<PlatformAccess | null>;
}

export class AuthorizationError extends DomainError {
  constructor(code = "FORBIDDEN", message = "The authenticated user is not allowed to perform this operation.") {
    super(code, message);
    this.name = "AuthorizationError";
  }
}

function assertUuid(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new DomainError("TENANT_SELECTION_INVALID", `${field} must be a valid UUID.`, { field });
  }
  return normalized;
}

function assertOperationalTenant(access: TenantAccess): TenantAccess {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("TENANT_MEMBERSHIP_INACTIVE", "The tenant membership is not active.");
  }
  if (access.tenantStatus === "suspended") {
    throw new AuthorizationError("TENANT_SUSPENDED", "The selected tenant is suspended.");
  }
  if (access.tenantStatus === "closed") {
    throw new AuthorizationError("TENANT_CLOSED", "The selected tenant is closed.");
  }
  return access;
}

export class AuthorizationService {
  constructor(private readonly accessControl: AccessControlRepository) {}

  listTenantMemberships(authSubject: string): Promise<TenantAccess[]> {
    return this.accessControl.listTenantAccesses(authSubject);
  }

  async listAvailableTenants(authSubject: string): Promise<TenantAccess[]> {
    return (await this.listTenantMemberships(authSubject))
      .filter((access) => access.membershipStatus === "active" && (access.tenantStatus === "active" || access.tenantStatus === "trial"));
  }

  async resolveTenantContext(authSubject: string, tenantSelection?: string): Promise<TenantAccess> {
    if (tenantSelection) {
      const tenantId = assertUuid(tenantSelection, "tenantId");
      const access = await this.accessControl.resolveTenantAccess(authSubject, tenantId);
      if (!access) {
        throw new AuthorizationError("TENANT_MEMBERSHIP_REQUIRED", "The authenticated user is not a member of the selected tenant.");
      }
      return assertOperationalTenant(access);
    }

    const accesses = await this.listAvailableTenants(authSubject);
    if (accesses.length === 0) {
      throw new AuthorizationError("TENANT_MEMBERSHIP_REQUIRED", "The authenticated user has no active tenant membership.");
    }
    if (accesses.length > 1) {
      throw new DomainError("TENANT_SELECTION_REQUIRED", "A tenant selection is required because the authenticated user belongs to multiple tenants.", {
        tenantIds: accesses.map((access) => access.tenantId),
      });
    }
    return accesses[0];
  }

  async requireResolvedTenantPermission(authSubject: string, tenantSelection: string | undefined, permission: PermissionCode): Promise<TenantAccess> {
    const access = await this.resolveTenantContext(authSubject, tenantSelection);
    if (!access.permissions.includes(permission)) {
      throw new AuthorizationError("PERMISSION_REQUIRED", `Permission ${permission} is required.`);
    }
    return access;
  }

  async requireTenantPermission(authSubject: string, tenantId: string, permission: PermissionCode): Promise<TenantAccess> {
    return this.requireResolvedTenantPermission(authSubject, tenantId, permission);
  }

  async requirePlatformPermission(authSubject: string, permission: PermissionCode): Promise<PlatformAccess> {
    const access = await this.accessControl.resolvePlatformAccess(authSubject);
    if (!access || !access.permissions.includes(permission)) {
      throw new AuthorizationError("PLATFORM_PERMISSION_REQUIRED", `Platform permission ${permission} is required.`);
    }
    return access;
  }
}

import type { PermissionCode } from "@/server/auth/permissions";
import { DomainError } from "@/shared/domain/core";

export interface TenantAccess {
  actorId: string;
  authSubject: string;
  tenantId: string;
  membershipId: string;
  membershipStatus: "active" | "inactive" | "suspended";
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
  resolveTenantAccess(authSubject: string, tenantId: string): Promise<TenantAccess | null>;
  resolvePlatformAccess(authSubject: string): Promise<PlatformAccess | null>;
}

export class AuthorizationError extends DomainError {
  constructor(code = "FORBIDDEN", message = "The authenticated user is not allowed to perform this operation.") {
    super(code, message);
    this.name = "AuthorizationError";
  }
}

export class AuthorizationService {
  constructor(private readonly accessControl: AccessControlRepository) {}

  async requireTenantPermission(authSubject: string, tenantId: string, permission: PermissionCode): Promise<TenantAccess> {
    const access = await this.accessControl.resolveTenantAccess(authSubject, tenantId);
    if (!access) throw new AuthorizationError("TENANT_MEMBERSHIP_REQUIRED", "The authenticated user is not a member of this tenant.");
    if (access.membershipStatus !== "active") throw new AuthorizationError("TENANT_MEMBERSHIP_INACTIVE", "The tenant membership is not active.");
    if (!access.permissions.includes(permission)) throw new AuthorizationError("PERMISSION_REQUIRED", `Permission ${permission} is required.`);
    return access;
  }

  async requirePlatformPermission(authSubject: string, permission: PermissionCode): Promise<PlatformAccess> {
    const access = await this.accessControl.resolvePlatformAccess(authSubject);
    if (!access || !access.permissions.includes(permission)) {
      throw new AuthorizationError("PLATFORM_PERMISSION_REQUIRED", `Platform permission ${permission} is required.`);
    }
    return access;
  }
}

import type { PermissionCode } from "@/server/auth/permissions";
import type { WorkspaceRole } from "@/shared/application/execution-context";
import { DomainError, NotFoundError } from "@/shared/domain/core";
import type { TenantStatus } from "@/shared/domain/models";

export interface WorkspaceProfessionalOption {
  id: string;
  displayName: string;
  specialty?: string;
}

export interface WorkspaceRoleOption {
  code: WorkspaceRole;
  label: string;
  professionals?: WorkspaceProfessionalOption[];
}

export interface WorkspaceTenantOption {
  id: string;
  displayName: string;
  publicSlug?: string;
  status: TenantStatus;
  roles: WorkspaceRoleOption[];
}

export interface WorkspaceCatalog {
  tenants: WorkspaceTenantOption[];
}

export interface WorkspaceSelection {
  tenantId?: string;
  role?: string;
  professionalId?: string;
}

export interface ResolvedWorkspaceContext {
  tenantId: string;
  tenantDisplayName: string;
  tenantPublicSlug?: string;
  tenantStatus: TenantStatus;
  role: WorkspaceRole;
  professionalId?: string;
}

export interface WorkspaceContextRepository {
  listCatalog(): Promise<WorkspaceCatalog>;
  findTenant(tenantId: string): Promise<WorkspaceTenantOption | null>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WORKSPACE_ROLES = new Set<WorkspaceRole>(["administrator", "reception", "professional"]);

function uuid(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new DomainError("WORKSPACE_SELECTION_INVALID", `${field} must be a valid UUID.`, { field });
  }
  return normalized;
}

function role(value: string | undefined): WorkspaceRole {
  const normalized = value?.trim().toLowerCase() as WorkspaceRole | undefined;
  if (!normalized || !WORKSPACE_ROLES.has(normalized)) {
    throw new DomainError(
      "WORKSPACE_ROLE_REQUIRED",
      "A valid workspace role is required. Select administrator, reception or professional.",
      { field: "role" },
    );
  }
  return normalized;
}

export class WorkspaceContextResolver {
  constructor(private readonly repository: WorkspaceContextRepository) {}

  listCatalog(): Promise<WorkspaceCatalog> {
    return this.repository.listCatalog();
  }

  async resolve(selection: WorkspaceSelection): Promise<ResolvedWorkspaceContext> {
    if (!selection.tenantId) {
      throw new DomainError("TENANT_SELECTION_REQUIRED", "Select a tenant before executing tenant-scoped operations.");
    }

    const tenantId = uuid(selection.tenantId, "tenantId");
    const selectedRole = role(selection.role);
    const tenant = await this.repository.findTenant(tenantId);
    if (!tenant) throw new NotFoundError("tenant", tenantId);
    if (tenant.status === "suspended") throw new DomainError("TENANT_SUSPENDED", "The selected tenant is suspended.");
    if (tenant.status === "closed") throw new DomainError("TENANT_CLOSED", "The selected tenant is closed.");

    const roleOption = tenant.roles.find((item) => item.code === selectedRole);
    if (!roleOption) {
      throw new DomainError("WORKSPACE_ROLE_UNAVAILABLE", "The selected role is not available for this tenant.", {
        tenantId,
        role: selectedRole,
      });
    }

    let professionalId: string | undefined;
    if (selectedRole === "professional") {
      if (!selection.professionalId) {
        throw new DomainError(
          "PROFESSIONAL_CONTEXT_REQUIRED",
          "Select a professional profile when using the professional workspace.",
        );
      }
      professionalId = uuid(selection.professionalId, "professionalId");
      if (!roleOption.professionals?.some((professional) => professional.id === professionalId)) {
        throw new DomainError(
          "PROFESSIONAL_CONTEXT_INVALID",
          "The selected professional is not active in the selected tenant.",
          { tenantId, professionalId },
        );
      }
    }

    return {
      tenantId: tenant.id,
      tenantDisplayName: tenant.displayName,
      tenantPublicSlug: tenant.publicSlug,
      tenantStatus: tenant.status,
      role: selectedRole,
      professionalId,
    };
  }
}

export function workspaceRoleAllowsPermission(
  workspaceRole: WorkspaceRole,
  permission: PermissionCode,
  permissionsByRole: Readonly<Record<WorkspaceRole, readonly PermissionCode[]>>,
): boolean {
  return permissionsByRole[workspaceRole].includes(permission);
}

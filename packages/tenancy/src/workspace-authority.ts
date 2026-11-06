import type { TenantMembership } from './tenant-membership.js';

export type WorkspaceRole = 'administrator' | 'reception' | 'professional';
const roles = {
  administrator: 'tenant_admin',
  reception: 'reception',
  professional: 'professional',
} as const;

export function workspaceRole(role: string): WorkspaceRole | null {
  return (
    (Object.keys(roles) as WorkspaceRole[]).find(
      (key) => roles[key] === role,
    ) ?? null
  );
}

export function resolveWorkspace(
  membership: TenantMembership,
  selection?: { role?: string; professionalId?: string; tenantId?: string },
): TenantMembership {
  if (
    !membership.active ||
    (selection?.tenantId && selection.tenantId !== membership.tenantId)
  )
    throw new Error('TENANT_ACCESS_DENIED');
  const available = membership.roles
    .map(workspaceRole)
    .filter((role): role is WorkspaceRole => role !== null);
  const selected =
    selection?.role ?? (available.length === 1 ? available[0] : undefined);
  if (
    !selected ||
    !Object.hasOwn(roles, selected) ||
    !available.includes(selected as WorkspaceRole)
  )
    throw new Error('PERMISSION_DENIED');
  const role = roles[selected as WorkspaceRole];
  if (
    (selected === 'professional' && !membership.professionalId) ||
    (selection?.professionalId !== undefined &&
      selection.professionalId !== membership.professionalId)
  )
    throw new Error('PERMISSION_DENIED');
  const permissions =
    membership.rolePermissions?.[role] ??
    (membership.roles.length === 1 ? membership.permissions : undefined);
  if (!permissions) throw new Error('PERMISSION_DENIED');
  return {
    ...membership,
    roles: [role],
    permissions: [...permissions],
    selectedRole: selected as WorkspaceRole,
  };
}

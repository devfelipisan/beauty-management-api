import { resolveWorkspace, workspaceRole } from './workspace-authority.js';
import type { TenantMembership } from './tenant-membership.js';

const membership: TenantMembership = {
  tenantId: 'tenant-a',
  actorId: 'actor-a',
  active: true,
  roles: ['tenant_admin', 'professional'],
  professionalId: 'professional-a',
  permissions: ['agenda.read', 'customer.update'],
  rolePermissions: {
    tenant_admin: ['agenda.read', 'customer.update'],
    professional: ['agenda.read'],
  },
};
describe('selected workspace authority', () => {
  it('maps only supported persisted roles', () => {
    expect(workspaceRole('tenant_admin')).toBe('administrator');
    expect(workspaceRole('unknown')).toBeNull();
  });
  it('never uses the union of roles and preserves persisted professional restrictions', () => {
    const result = resolveWorkspace(membership, { role: 'professional' });
    expect(result.permissions).toEqual(['agenda.read']);
    expect(result.professionalId).toBe('professional-a');
    expect(
      resolveWorkspace(membership, { role: 'administrator' }).professionalId,
    ).toBe('professional-a');
    expect(membership.roles).toHaveLength(2);
  });
  it('rejects ambiguous, revoked, foreign tenant and foreign professional selections', () => {
    for (const selection of [
      undefined,
      { role: 'reception' },
      { role: 'professional', tenantId: 'tenant-b' },
      { role: 'professional', professionalId: 'professional-b' },
    ]) {
      expect(() => resolveWorkspace(membership, selection)).toThrow();
    }
  });
  it('resolves V1 only for one supported role without removing restrictions', () => {
    expect(
      resolveWorkspace({ ...membership, roles: ['professional'] }).permissions,
    ).toEqual(['agenda.read']);
    expect(() =>
      resolveWorkspace(
        { ...membership, rolePermissions: undefined },
        { role: 'professional' },
      ),
    ).toThrow('PERMISSION_DENIED');
  });
});

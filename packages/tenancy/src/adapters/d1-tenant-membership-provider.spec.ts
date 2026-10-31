import { D1TenantMembershipProvider } from './d1-tenant-membership-provider.js';

function fixture() {
  const first = vi.fn();
  const all = vi.fn();
  const bind = vi.fn(() => ({ first, all }));
  const prepare = vi.fn(() => ({ bind }));
  return {
    first,
    all,
    bind,
    prepare,
    provider: new D1TenantMembershipProvider({ prepare } as never),
  };
}
describe('D1 membership row mapping (unit)', () => {
  it('maps only a resolved issuer/subject identity, preserving subject and database errors', async () => {
    const f = fixture();
    f.first.mockResolvedValue({ id: 'internal' });
    expect(await f.provider.findIdentity('issuer', 'subject')).toEqual({
      actorId: 'internal',
      subject: 'subject',
    });
    expect(f.bind).toHaveBeenCalledWith('issuer', 'subject');
    f.first.mockResolvedValue(null);
    expect(await f.provider.findIdentity('issuer', 'unknown')).toBeNull();
    const failure = new Error('DB_FAILURE');
    f.first.mockRejectedValue(failure);
    await expect(f.provider.findIdentity('issuer', 'subject')).rejects.toBe(
      failure,
    );
  });
  it('deduplicates current grants, preserves professional scope and returns no implicit grants', async () => {
    const f = fixture();
    const row = {
      role_name: 'professional',
      permission_code: 'session.complete',
      professional_id: 'professional',
    };
    f.all.mockResolvedValue({
      results: [row, row, { ...row, role_name: null, permission_code: null }],
    });
    expect(await f.provider.findActiveMembership('actor', 'tenant')).toEqual({
      actorId: 'actor',
      tenantId: 'tenant',
      active: true,
      professionalId: 'professional',
      roles: ['professional'],
      permissions: ['session.complete'],
    });
    expect(f.bind).toHaveBeenLastCalledWith('tenant', 'actor');
    f.all.mockResolvedValue({
      results: [
        { role_name: null, permission_code: null, professional_id: null },
      ],
    });
    expect(
      await f.provider.findActiveMembership('actor', 'tenant'),
    ).toMatchObject({ professionalId: undefined, roles: [], permissions: [] });
    f.all.mockResolvedValue({ results: [] });
    expect(await f.provider.findActiveMembership('actor', 'tenant')).toBeNull();
  });
  it('groups supported workspace roles and skips unknown roles and missing professional links', async () => {
    const f = fixture();
    const tenant = {
      id: 'tenant',
      display_name: 'Workspace',
      status: 'ACTIVE',
      professional_id: null,
      professional_name: null,
    };
    f.all.mockResolvedValue({
      results: [
        { ...tenant, role_name: 'tenant_admin' },
        { ...tenant, role_name: 'reception' },
        {
          ...tenant,
          role_name: 'professional',
          professional_id: 'p',
          professional_name: 'Professional',
        },
        { ...tenant, role_name: 'professional' },
        { ...tenant, role_name: 'unapproved' },
        { ...tenant, id: 'other', role_name: 'reception' },
      ],
    });
    const result = await f.provider.listActiveWorkspaces('actor');
    expect(f.bind).toHaveBeenCalledWith('actor');
    expect(result.tenants).toHaveLength(2);
    expect(result.tenants[0]).toMatchObject({
      id: 'tenant',
      displayName: 'Workspace',
      roles: [
        { code: 'administrator' },
        { code: 'reception' },
        {
          code: 'professional',
          professionals: [{ id: 'p', displayName: 'Professional' }],
        },
      ],
    });
    f.all.mockResolvedValue({ results: [] });
    expect(await f.provider.listActiveWorkspaces('actor')).toEqual({
      tenants: [],
    });
  });
});

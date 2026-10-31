import { TenantGuard } from './tenant.guard.js';

function requestContext(request: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as never;
}

describe('TenantGuard', () => {
  it('rejects absent identity/tenant before querying memberships', async () => {
    const findActiveMembership = vi.fn();
    const guard = new TenantGuard({ findActiveMembership });
    await expect(guard.canActivate(requestContext({}))).rejects.toMatchObject({
      response: { code: 'AUTHENTICATION_REQUIRED' },
    });
    for (const params of [
      undefined,
      {},
      { tenantId: '' },
      { tenantId: ['tenant'] },
    ]) {
      await expect(
        guard.canActivate(
          requestContext({ user: { actorId: 'actor' }, params }),
        ),
      ).rejects.toMatchObject({ response: { code: 'TENANT_ACCESS_DENIED' } });
    }
    expect(findActiveMembership).not.toHaveBeenCalled();
  });
  it('rejects inactive or mismatched actors without attaching a trusted context', async () => {
    const findActiveMembership = vi.fn();
    const guard = new TenantGuard({ findActiveMembership });
    for (const membership of [
      null,
      { active: false, actorId: 'actor' },
      { active: true, actorId: 'other' },
    ]) {
      findActiveMembership.mockResolvedValue(membership);
      const request = {
        user: { actorId: 'actor' },
        params: { tenantId: 'tenant' },
      };
      await expect(
        guard.canActivate(requestContext(request)),
      ).rejects.toMatchObject({ response: { code: 'TENANT_ACCESS_DENIED' } });
      expect(request).not.toHaveProperty('tenantContext');
    }
    findActiveMembership.mockResolvedValue({
      active: true,
      actorId: 'actor',
      tenantId: 'tenant',
      roles: [],
      permissions: [],
    });
    const request = {
      user: { actorId: 'actor' },
      params: { tenantId: 'tenant' },
    };
    expect(await guard.canActivate(requestContext(request))).toBe(true);
    expect(request).toMatchObject({
      tenantContext: { actorId: 'actor', tenantId: 'tenant' },
    });
  });
  const provider = {
    findActiveMembership: async (actorId: string, tenantId: string) =>
      actorId === 'actor-a' && tenantId === 'tenant-a'
        ? {
            tenantId,
            actorId,
            active: true,
            roles: ['admin'],
            permissions: ['appointment.create'],
          }
        : null,
  };

  it('denies cross-tenant access and missing membership', async () => {
    const guard = new TenantGuard(provider);
    const request = {
      user: { actorId: 'actor-a', subject: 'subject-a' },
      params: { tenantId: 'tenant-b' },
    };
    await expect(
      guard.canActivate(requestContext(request)),
    ).rejects.toMatchObject({
      response: { code: 'TENANT_ACCESS_DENIED' },
    });
  });

  it('creates trusted tenant context only after membership resolution', async () => {
    const request = {
      user: { actorId: 'actor-a', subject: 'subject-a' },
      params: { tenantId: 'tenant-a' },
      executionContext: {
        requestId: 'r-1',
        correlationId: 'c-1',
        actorId: 'actor-a',
      },
    };
    await expect(
      new TenantGuard(provider).canActivate(requestContext(request)),
    ).resolves.toBe(true);
    expect(request).toMatchObject({
      tenantContext: { tenantId: 'tenant-a', actorId: 'actor-a' },
      executionContext: { tenantId: 'tenant-a' },
    });
  });
});

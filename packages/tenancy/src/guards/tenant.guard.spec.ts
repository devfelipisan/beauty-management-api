import { TenantGuard } from './tenant.guard.js';

function requestContext(request: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as never;
}

describe('TenantGuard', () => {
  const provider = {
    findActiveMembership: async (actorId: string, tenantId: string) =>
      actorId === 'actor-a' && tenantId === 'tenant-a'
        ? { tenantId, actorId, active: true, roles: ['admin'], permissions: ['appointment.create'] }
        : null,
  };

  it('denies cross-tenant access and missing membership', async () => {
    const guard = new TenantGuard(provider);
    const request = { user: { actorId: 'actor-a', subject: 'subject-a' }, params: { tenantId: 'tenant-b' } };
    await expect(guard.canActivate(requestContext(request))).rejects.toMatchObject({
      response: { code: 'TENANT_ACCESS_DENIED' },
    });
  });

  it('creates trusted tenant context only after membership resolution', async () => {
    const request = {
      user: { actorId: 'actor-a', subject: 'subject-a' },
      params: { tenantId: 'tenant-a' },
      executionContext: { requestId: 'r-1', correlationId: 'c-1', actorId: 'actor-a' },
    };
    await expect(new TenantGuard(provider).canActivate(requestContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      tenantContext: { tenantId: 'tenant-a', actorId: 'actor-a' },
      executionContext: { tenantId: 'tenant-a' },
    });
  });
});

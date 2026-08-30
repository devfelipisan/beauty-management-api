import { PermissionGuard } from './permission.guard.js';

function requestContext(request: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => undefined, getClass: () => undefined } as never;
}

describe('PermissionGuard', () => {
  it('allows required permissions and denies missing permissions', () => {
    const allow = new PermissionGuard({ getAllAndOverride: () => ['appointment.create'] } as never);
    expect(allow.canActivate(requestContext({
      tenantMembership: { active: true, permissions: ['appointment.create'] },
    }))).toBe(true);

    const deny = new PermissionGuard({ getAllAndOverride: () => ['payment.refund'] } as never);
    expect(() => deny.canActivate(requestContext({
      tenantMembership: { active: true, permissions: ['appointment.create'] },
    }))).toThrow();
  });
});

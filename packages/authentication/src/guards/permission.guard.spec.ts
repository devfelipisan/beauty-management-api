import { PermissionGuard } from './permission.guard.js';

function requestContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
}

describe('PermissionGuard', () => {
  it('denies operations without an approved permission even for a member with read access', () => {
    for (const required of [undefined, []]) {
      const guard = new PermissionGuard({
        getAllAndOverride: () => required,
      } as never);
      expect(() =>
        guard.canActivate(
          requestContext({
            tenantMembership: {
              active: true,
              permissions: ['customer.read', 'professional.read'],
            },
          }),
        ),
      ).toThrow();
    }
  });
  it('allows required permissions and denies missing permissions', () => {
    const allow = new PermissionGuard({
      getAllAndOverride: () => ['appointment.create'],
    } as never);
    expect(
      allow.canActivate(
        requestContext({
          tenantMembership: {
            active: true,
            permissions: ['appointment.create'],
          },
        }),
      ),
    ).toBe(true);

    const deny = new PermissionGuard({
      getAllAndOverride: () => ['payment.refund'],
    } as never);
    expect(() =>
      deny.canActivate(
        requestContext({
          tenantMembership: {
            active: true,
            permissions: ['appointment.create'],
          },
        }),
      ),
    ).toThrow();
  });
});

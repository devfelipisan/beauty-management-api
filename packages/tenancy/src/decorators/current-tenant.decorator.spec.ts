import { type ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { CurrentTenant } from './current-tenant.decorator.js';

describe('CurrentTenant transport adapter', () => {
  it('extracts the resolved context instead of treating request params/body as authority', () => {
    class Handler {
      handle(_tenant: unknown) {}
    }
    CurrentTenant()(Handler.prototype, 'handle', 0);
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      Handler,
      'handle',
    ) as Record<
      string,
      { factory: (data: unknown, context: ExecutionContext) => unknown }
    >;
    const [{ factory }] = Object.values(metadata);
    const tenant = { tenantId: 'verified-tenant', actorId: 'verified-actor' };
    const context = (request: object) =>
      ({
        switchToHttp: () => ({ getRequest: () => request }),
      }) as ExecutionContext;
    expect(
      factory(
        undefined,
        context({ tenantContext: tenant, params: { tenantId: 'other' } }),
      ),
    ).toBe(tenant);
    expect(
      factory(undefined, context({ params: { tenantId: 'other' } })),
    ).toBeUndefined();
  });
});

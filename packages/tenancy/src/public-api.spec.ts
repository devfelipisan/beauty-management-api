import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  TenancyModule,
  TenantGuard,
  TENANT_MEMBERSHIP_PROVIDER,
} from '@beauty/tenancy';
import { MockTenantMembershipProvider } from '@beauty/tenancy/adapters/mock-tenant-membership-provider';

describe('tenancy package public exports', () => {
  it('resolves fixture membership through the exported Nest module and guard', async () => {
    const module = await Test.createTestingModule({ imports: [TenancyModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ APP_ENV: 'test', AUTH_PROVIDER: 'mock' }))
      .compile();
    try {
      const provider = module.get<MockTenantMembershipProvider>(
        TENANT_MEMBERSHIP_PROVIDER,
      );
      expect(
        await provider.findActiveMembership('other', 'tenant-dev-001'),
      ).toBeNull();
      const request = {
        user: { actorId: 'actor-dev-admin' },
        params: { tenantId: 'tenant-dev-001' },
      };
      expect(
        await new TenantGuard(provider).canActivate({
          switchToHttp: () => ({ getRequest: () => request }),
        } as never),
      ).toBe(true);
      expect(request).toMatchObject({
        tenantContext: {
          tenantId: 'tenant-dev-001',
          actorId: 'actor-dev-admin',
        },
      });
    } finally {
      await module.close();
    }
  });
});

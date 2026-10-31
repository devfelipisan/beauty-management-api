import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TenancyModule } from './tenancy.module.js';
import { TENANT_MEMBERSHIP_PROVIDER } from './ports/tenant-membership-provider.js';
import { MockTenantMembershipProvider } from './adapters/mock-tenant-membership-provider.js';

function compile(
  values: Record<string, unknown>,
  provider?: { findActiveMembership: ReturnType<typeof vi.fn> },
) {
  return Test.createTestingModule({
    imports: [provider ? TenancyModule.register(provider) : TenancyModule],
  })
    .overrideProvider(ConfigService)
    .useValue(new ConfigService(values))
    .compile();
}
describe('tenancy module composition', () => {
  it.each(['local', 'test'])(
    'uses fixture memberships only in %s',
    async (APP_ENV) => {
      const module = await compile({ APP_ENV, AUTH_PROVIDER: 'mock' });
      try {
        const provider = module.get<MockTenantMembershipProvider>(
          TENANT_MEMBERSHIP_PROVIDER,
        );
        expect(provider).toBeInstanceOf(MockTenantMembershipProvider);
        expect(
          await provider.findActiveMembership(
            'actor-dev-admin',
            'tenant-dev-001',
          ),
        ).toMatchObject({ active: true, tenantId: 'tenant-dev-001' });
        expect(
          await provider.findActiveMembership('actor-other', 'tenant-dev-001'),
        ).toBeNull();
        expect(
          await provider.findActiveMembership('actor-dev-admin', 'other'),
        ).toBeNull();
        const membership = await provider.findActiveMembership(
          'actor-dev-admin',
          'tenant-dev-001',
        );
        for (const permission of [
          'customer.update',
          'service.update',
          'service.deactivate',
        ])
          expect(membership?.permissions).not.toContain(permission);
      } finally {
        await module.close();
      }
    },
  );
  it.each([
    {},
    { APP_ENV: 'production', AUTH_PROVIDER: 'mock' },
    { APP_ENV: 'production', AUTH_PROVIDER: 'jwt' },
  ])('requires an explicit remote provider in %j', async (values) => {
    await expect(compile(values)).rejects.toThrow(
      'INVALID_AUTHENTICATION_CONFIGURATION',
    );
  });
  it('uses the registered provider unchanged in production', async () => {
    const provider = { findActiveMembership: vi.fn().mockResolvedValue(null) };
    const module = await compile(
      { APP_ENV: 'production', AUTH_PROVIDER: 'jwt' },
      provider,
    );
    try {
      expect(module.get(TENANT_MEMBERSHIP_PROVIDER)).toBe(provider);
    } finally {
      await module.close();
    }
  });
});

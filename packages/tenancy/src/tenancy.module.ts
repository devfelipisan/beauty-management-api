import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MockTenantMembershipProvider } from './adapters/mock-tenant-membership-provider.js';
import { TenantGuard } from './guards/tenant.guard.js';
import { TENANT_MEMBERSHIP_PROVIDER } from './ports/tenant-membership-provider.js';
import type { TenantMembershipProvider } from './ports/tenant-membership-provider.js';

@Module({
  imports: [ConfigModule],
  providers: [
    MockTenantMembershipProvider,
    TenantGuard,
    {
      provide: TENANT_MEMBERSHIP_PROVIDER,
      inject: [ConfigService, MockTenantMembershipProvider],
      useFactory: (
        config: ConfigService,
        mock: MockTenantMembershipProvider,
      ) => {
        if (
          config.get<string>('AUTH_PROVIDER', 'mock') === 'mock' &&
          ['local', 'test'].includes(config.get<string>('APP_ENV', ''))
        )
          return mock;
        throw new Error('INVALID_AUTHENTICATION_CONFIGURATION');
      },
    },
  ],
  exports: [TenantGuard, TENANT_MEMBERSHIP_PROVIDER],
})
export class TenancyModule {
  static register(provider: TenantMembershipProvider): DynamicModule {
    return {
      module: TenancyModule,
      providers: [{ provide: TENANT_MEMBERSHIP_PROVIDER, useValue: provider }],
    };
  }
}

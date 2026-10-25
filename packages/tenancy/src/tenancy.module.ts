import { Module } from '@nestjs/common';
import { MockTenantMembershipProvider } from './adapters/mock-tenant-membership-provider.js';
import { TenantGuard } from './guards/tenant.guard.js';
import { TENANT_MEMBERSHIP_PROVIDER } from './ports/tenant-membership-provider.js';

@Module({
  providers: [
    MockTenantMembershipProvider,
    TenantGuard,
    { provide: TENANT_MEMBERSHIP_PROVIDER, useExisting: MockTenantMembershipProvider },
  ],
  exports: [TenantGuard, TENANT_MEMBERSHIP_PROVIDER],
})
export class TenancyModule {}

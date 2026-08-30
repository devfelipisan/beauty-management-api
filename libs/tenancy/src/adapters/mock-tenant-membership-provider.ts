import { Injectable } from '@nestjs/common';
import type { TenantMembership } from '../tenant-membership.js';
import type { TenantMembershipProvider } from '../ports/tenant-membership-provider.js';

@Injectable()
export class MockTenantMembershipProvider implements TenantMembershipProvider {
  async findActiveMembership(actorId: string, tenantId: string): Promise<TenantMembership | null> {
    if (actorId !== 'actor-dev-admin' || tenantId !== 'tenant-dev-001') return null;
    return {
      tenantId,
      actorId,
      active: true,
      roles: ['admin'],
      permissions: ['customer.read', 'appointment.create'],
    };
  }
}

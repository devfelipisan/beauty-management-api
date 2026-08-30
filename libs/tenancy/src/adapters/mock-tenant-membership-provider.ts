import type { TenantMembership } from '../tenant-membership.js';
import type { TenantMembershipProvider } from '../ports/tenant-membership-provider.js';

export class MockTenantMembershipProvider implements TenantMembershipProvider {
  async findActiveMembership(actorId: string, tenantId: string): Promise<TenantMembership | null> {
    if (actorId !== 'actor-dev-admin' || tenantId !== 'tenant-dev-001') return null;
    return {
      tenantId,
      actorId,
      active: true,
      roles: ['admin'],
      permissions: [
        'customer.create', 'customer.read',
        'professional.create', 'professional.read',
        'service.create', 'service.read',
        'appointment.create', 'appointment.confirm', 'appointment.check-in', 'session.start', 'technical-form.create', 'technical-form.publish', 'technical-form.read', 'session.technical.update', 'equipment.create', 'equipment.update', 'equipment.status.change', 'equipment.read', 'variation-policy.configure', 'intercurrence.report', 'intercurrence.resolve', 'intercurrence.read',
      ],
    };
  }
}

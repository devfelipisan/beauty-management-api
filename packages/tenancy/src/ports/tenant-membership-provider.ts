import type { TenantMembership } from '../tenant-membership.js';

export const TENANT_MEMBERSHIP_PROVIDER = Symbol('TENANT_MEMBERSHIP_PROVIDER');

export interface TenantMembershipProvider {
  findActiveMembership(actorId: string, tenantId: string): Promise<TenantMembership | null>;
}

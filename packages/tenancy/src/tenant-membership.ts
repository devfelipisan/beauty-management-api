export interface TenantMembership {
  tenantId: string;
  actorId: string;
  active: boolean;
  roles: string[];
  permissions: string[];
}

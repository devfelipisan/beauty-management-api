export interface TenantMembership {
  tenantId: string;
  actorId: string;
  active: boolean;
  roles: string[];
  permissions: string[];
  professionalId?: string;
  rolePermissions?: Record<string, readonly string[]>;
  selectedRole?: 'administrator' | 'reception' | 'professional';
}

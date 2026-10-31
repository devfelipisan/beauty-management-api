import { workerSecurity } from '@beauty/tenancy/adapters/worker-security';
import { D1TenantMembershipProvider } from '@beauty/tenancy/adapters/d1-tenant-membership-provider';
import { ids, json, mappedError, notFound } from '@beauty/cloudflare-runtime';
import type { OperationsEnv } from './env.js';
import type {
  MyContextResponse,
  MyWorkspacesResponse,
} from '@beauty/contracts';

export async function identityRoute(
  request: Request,
  env: OperationsEnv,
): Promise<Response | undefined> {
  const path = new URL(request.url).pathname;
  if (!['/v1/me/tenants', '/v1/me/context'].includes(path)) return;
  if (request.method !== 'GET') return notFound();
  const { requestId, correlationId } = ids(request);
  try {
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!token) throw new Error('AUTHENTICATION_REQUIRED');
    const security = workerSecurity(env);
    const identity = await security.identity.authenticate(token);
    if (!identity) throw new Error('INVALID_AUTHENTICATION');
    if (path === '/v1/me/tenants') {
      const data: MyWorkspacesResponse = await new D1TenantMembershipProvider(
        env.D1_DATABASE,
      ).listActiveWorkspaces(identity.actorId);
      return json({ data, requestId, correlationId });
    }
    const tenantId = request.headers.get('x-tenant-id');
    if (!tenantId) throw new Error('TENANT_ACCESS_DENIED');
    const membership = await security.membership.findActiveMembership(
      identity.actorId,
      tenantId,
    );
    if (!membership) throw new Error('TENANT_ACCESS_DENIED');
    const selectedRole = request.headers.get('x-workspace-role');
    const roleName =
      selectedRole === 'administrator' ? 'tenant_admin' : selectedRole;
    if (roleName && !membership.roles.includes(roleName))
      throw new Error('PERMISSION_DENIED');
    const selectedProfessional = request.headers.get('x-professional-id');
    if (
      (selectedProfessional &&
        selectedProfessional !== membership.professionalId) ||
      (selectedRole === 'professional' && !membership.professionalId)
    )
      throw new Error('PERMISSION_DENIED');
    const data: MyContextResponse = {
      actorId: identity.actorId,
      tenantId,
      roles: membership.roles,
      permissions: membership.permissions,
      professionalId: membership.professionalId,
    };
    return json({ data, requestId, correlationId });
  } catch (error) {
    return mappedError(error, requestId, correlationId);
  }
}

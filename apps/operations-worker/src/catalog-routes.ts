import { ids, json, mappedError } from '@beauty/cloudflare-runtime';
import { workerSecurity } from '@beauty/tenancy/adapters/worker-security';
import { readCatalogPage } from './composition-root.js';
import type { OperationsEnv } from './env.js';

/** Existing collection URLs, with additive page metadata. Mutations keep their handlers. */
export async function catalogRoute(request: Request, env: OperationsEnv): Promise<Response | undefined> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/tenants\/([^/]+)\/(customers|professionals|services)$/);
  if (!match || request.method !== 'GET') return;
  const { requestId, correlationId } = ids(request);
  try {
    const token = request.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!token) throw new Error('AUTHENTICATION_REQUIRED');
    const security = workerSecurity(env, request);
    const identity = await security.identity.authenticate(token);
    if (!identity) throw new Error('INVALID_AUTHENTICATION');
    const membership = await security.membership.findActiveMembership(identity.actorId, match[1]);
    if (!membership) throw new Error('TENANT_ACCESS_DENIED');
    for (const key of url.searchParams.keys()) {
      if (!['limit', 'cursor'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error('VALIDATION_ERROR');
    }
    const kind = match[2];
    if (kind !== 'customers' && kind !== 'professionals' && kind !== 'services') throw new Error('VALIDATION_ERROR');
    const result = await readCatalogPage(env, kind, { limit: url.searchParams.get('limit') ?? undefined, cursor: url.searchParams.get('cursor') ?? undefined }, membership);
    return json({ ...result, requestId, correlationId });
  } catch (error) { return mappedError(error, requestId, correlationId); }
}

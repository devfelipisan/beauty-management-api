import { ids, json, mappedError, notFound } from '@beauty/cloudflare-runtime';
import { workerSecurity } from '@beauty/tenancy/adapters/worker-security';
import {
  listProfessionals,
  type OperationsComposition,
} from '../composition-root.js';

export async function handleProfessionals(
  request: Request,
  composition: OperationsComposition,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/tenants\/([^/]+)\/professionals$/);
  if (!match) return undefined;
  if (request.method !== 'GET') return notFound();
  const tenantId = match[1];
  const { requestId, correlationId } = ids(request);
  const fail = (code: string, status: number) =>
    json({ status: 'error', code, requestId, correlationId }, status);
  try {
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    const security = workerSecurity(composition.env, request);
    const identity = token ? await security.identity.authenticate(token) : null;
    if (!identity)
      return fail(
        token ? 'INVALID_AUTHENTICATION' : 'AUTHENTICATION_REQUIRED',
        401,
      );
    const membership = await security.membership.findActiveMembership(
      identity.actorId,
      tenantId,
    );
    if (!membership) return fail('TENANT_ACCESS_DENIED', 403);
    if (!membership.permissions.includes('professional.read'))
      return fail('PERMISSION_DENIED', 403);
    const limit = url.searchParams.has('limit')
      ? Number(url.searchParams.get('limit'))
      : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1))
      return fail('VALIDATION_ERROR', 400);
    const professionals = await listProfessionals(
      composition.env,
      tenantId,
      limit,
      url.searchParams.get('cursor') ?? undefined,
      membership.professionalId,
    );
    return json({
      data: professionals.map((item) => ({ id: item.id, ...item.data })),
      requestId,
      correlationId,
    });
  } catch (error) {
    return mappedError(error, requestId, correlationId);
  }
}

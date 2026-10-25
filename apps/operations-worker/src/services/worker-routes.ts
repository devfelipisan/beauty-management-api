import { MockIdentityProvider } from '@beauty/authentication/adapters/mock-identity-provider';
import { MockTenantMembershipProvider } from '@beauty/tenancy/adapters/mock-tenant-membership-provider';
import { ids, json, mappedError, notFound } from '@beauty/cloudflare-runtime';
import type { OperationsComposition } from '../composition-root.js';

export async function handleServices(
  request: Request,
  composition: OperationsComposition,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const match = url.pathname.match(
    /^\/tenants\/([^/]+)\/services(?:\/([^/]+))?$/,
  );
  if (!match) return undefined;
  const [, tenantId, serviceId] = match;
  const method = request.method.toUpperCase();
  if (
    !(serviceId ? ['GET', 'PATCH', 'DELETE'] : ['GET', 'POST']).includes(method)
  )
    return notFound();
  const { requestId, correlationId } = ids(request);
  const fail = (code: string, status: number) =>
    json({ status: 'error', code, requestId, correlationId }, status);
  try {
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    const identity = token
      ? await new MockIdentityProvider().authenticate(token)
      : null;
    if (!identity)
      return fail(
        token ? 'INVALID_AUTHENTICATION' : 'AUTHENTICATION_REQUIRED',
        401,
      );
    const membership =
      await new MockTenantMembershipProvider().findActiveMembership(
        identity.actorId,
        tenantId,
      );
    if (!membership) return fail('TENANT_ACCESS_DENIED', 403);
    // Same permissions as the existing Nest controller, including PATCH/DELETE.
    if (
      !membership.permissions.includes(
        method === 'POST' ? 'service.create' : 'service.read',
      )
    )
      return fail('PERMISSION_DENIED', 403);
    const services = composition.services();
    let result;
    if (method === 'GET' && !serviceId) {
      const limit = url.searchParams.has('limit')
        ? Number(url.searchParams.get('limit'))
        : undefined;
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1))
        return fail('VALIDATION_ERROR', 400);
      result = await services.list.execute(
        tenantId,
        limit,
        url.searchParams.get('cursor') ?? undefined,
      );
    } else if (method === 'GET')
      result = await services.get.execute(tenantId, serviceId!);
    else if (method === 'DELETE')
      result = await services.deactivate.execute(tenantId, serviceId!);
    else {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return fail('VALIDATION_ERROR', 400);
      }
      if (!validServiceBody(body, method === 'POST'))
        return fail('VALIDATION_ERROR', 400);
      result =
        method === 'POST'
          ? await services.create.execute({ ...body, tenantId } as Parameters<
              typeof services.create.execute
            >[0])
          : await services.update.execute(
              tenantId,
              serviceId!,
              body as Parameters<typeof services.update.execute>[2],
            );
    }
    if (result === null) return fail('RESOURCE_NOT_FOUND', 404);
    const serialize = (item: { id: string; data: object }) => ({
      id: item.id,
      ...item.data,
    });
    return json(
      {
        data: Array.isArray(result) ? result.map(serialize) : serialize(result),
        requestId,
        correlationId,
      },
      method === 'POST' ? 201 : 200,
    );
  } catch (error) {
    return mappedError(error, requestId, correlationId);
  }
}

function validServiceBody(
  value: unknown,
  create: boolean,
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const strings = ['name', 'category', 'depositMode'];
  const numbers = [
    'durationMinutes',
    'basePriceCents',
    'minimumPriceCents',
    'depositFixedCents',
    'depositPercentageBasisPoints',
  ];
  const flags = [
    'requiresAssessment',
    'allowsDiscount',
    'requiresEquipment',
    'requiresPhotography',
    'hasTechnicalForm',
  ];
  const allowed = [...strings, ...numbers, ...flags, 'technicalRequirements'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) return false;
  if (
    create &&
    ['name', 'category', 'durationMinutes', 'basePriceCents'].some(
      (key) => !(key in body),
    )
  )
    return false;
  if (strings.some((key) => key in body && typeof body[key] !== 'string'))
    return false;
  if (
    numbers.some(
      (key) =>
        key in body &&
        (typeof body[key] !== 'number' || !Number.isFinite(body[key])),
    )
  )
    return false;
  if (flags.some((key) => key in body && typeof body[key] !== 'boolean'))
    return false;
  if (
    'depositMode' in body &&
    !['NOT_REQUIRED', 'FIXED', 'PERCENTAGE'].includes(
      body.depositMode as string,
    )
  )
    return false;
  if (
    'technicalRequirements' in body &&
    (!body.technicalRequirements ||
      typeof body.technicalRequirements !== 'object' ||
      Array.isArray(body.technicalRequirements))
  )
    return false;
  return true;
}

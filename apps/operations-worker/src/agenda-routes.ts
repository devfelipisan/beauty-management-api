import { assertAgendaRead } from '@beauty/contracts';
import { ids, json, mappedError, notFound } from '@beauty/cloudflare-runtime';
import { workerSecurity } from '@beauty/tenancy/adapters/worker-security';
import type { AgendaQuery } from '@beauty/contracts';
import type { OperationsEnv } from './env.js';
import {
  listAgenda,
  agendaDetails,
  checkAgendaInterval,
} from './composition-root.js';

export async function agendaRoute(
  request: Request,
  env: OperationsEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const list = url.pathname.match(/^\/tenants\/([^/]+)\/agenda$/);
  const detail = url.pathname.match(
    /^\/tenants\/([^/]+)\/appointments\/([^/]+)$/,
  );
  const interval = url.pathname.match(
    /^\/tenants\/([^/]+)\/professionals\/([^/]+)\/availability$/,
  );
  const match = list ?? detail ?? interval;
  if (!match) return undefined;
  if (request.method !== 'GET') return notFound();
  const { requestId, correlationId } = ids(request);
  try {
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!token) throw new Error('AUTHENTICATION_REQUIRED');
    const security = workerSecurity(env, request);
    const identity = await security.identity.authenticate(token);
    if (!identity) throw new Error('INVALID_AUTHENTICATION');
    const authority = await security.membership.findActiveMembership(
      identity.actorId,
      match[1],
    );
    if (!authority) throw new Error('TENANT_ACCESS_DENIED');
    const allowed = list
      ? [
          'from',
          'to',
          'professionalId',
          'serviceId',
          'status',
          'limit',
          'cursor',
        ]
      : interval
        ? ['from', 'to']
        : [];
    for (const key of url.searchParams.keys()) {
      if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
        throw new Error('VALIDATION_ERROR');
    }
    let data;
    if (list) {
      const limit = url.searchParams.get('limit');
      if (limit !== null && !/^[1-9]\d*$/.test(limit))
        throw new Error('VALIDATION_ERROR');
      data = await listAgenda(
        env,
        {
          from: url.searchParams.get('from') ?? '',
          to: url.searchParams.get('to') ?? '',
          professionalId: url.searchParams.get('professionalId') ?? undefined,
          serviceId: url.searchParams.get('serviceId') ?? undefined,
          status: (url.searchParams.get('status') ??
            undefined) as AgendaQuery['status'],
          cursor: url.searchParams.get('cursor') ?? undefined,
          limit: limit === null ? undefined : Number(limit),
        },
        authority,
      );
    } else if (detail) {
      data = await agendaDetails(env, match[2], authority);
    } else {
      const from = url.searchParams.get('from') ?? '';
      const to = url.searchParams.get('to') ?? '';
      data = await checkAgendaInterval(env, match[2], from, to, authority);
    }
    if (!interval) assertAgendaRead(data);
    return json({ data, requestId, correlationId });
  } catch (error) {
    return mappedError(error, requestId, correlationId);
  }
}

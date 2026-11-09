import { D1SelectorWorkspaceProvider } from '@beauty/tenancy/adapters/d1-selector-workspace-provider';
import { ids, json, mappedError } from '@beauty/cloudflare-runtime';
import { assertAgendaRead } from '@beauty/contracts';
import type { AgendaQuery } from '@beauty/contracts';
import type { OperationsEnv } from './env.js';
import {
  readCatalogPage,
  listAgenda,
  agendaDetails,
} from './composition-root.js';

/** Only a private binding with server-configured caller props may enter this read port. */
export async function selectorRead(
  request: Request,
  env: OperationsEnv,
  caller: unknown,
): Promise<Response> {
  const { requestId, correlationId } = ids(request);
  try {
    if (caller !== 'beauty-management-web')
      throw new Error('PERMISSION_DENIED');
    if (request.method !== 'GET' || request.body)
      throw new Error('PERMISSION_DENIED');
    const url = new URL(request.url);
    const provider = new D1SelectorWorkspaceProvider(
      env.D1_DATABASE,
      env.SELECTOR_DEMO_TENANT_IDS,
    );
    if (url.pathname === '/v1/me/tenants') {
      if ([...url.searchParams].length) throw new Error('VALIDATION_ERROR');
      return json({ data: await provider.catalog(), requestId, correlationId });
    }
    const match = url.pathname.match(
      /^\/tenants\/([A-Za-z0-9_-]{1,128})\/(customers|professionals|services|agenda|appointments\/([A-Za-z0-9_-]{1,128}))$/,
    );
    if (!match && url.pathname !== '/v1/me/context')
      throw new Error('PERMISSION_DENIED');
    const tenantId = request.headers.get('x-tenant-id') ?? '';
    if (match && match[1] !== tenantId) throw new Error('PERMISSION_DENIED');
    const context = await provider.resolve(
      tenantId,
      request.headers.get('x-workspace-role'),
      request.headers.get('x-professional-id') ?? undefined,
    );
    const kind = match?.[2];
    const allowed =
      kind === 'agenda'
        ? [
            'from',
            'to',
            'professionalId',
            'serviceId',
            'status',
            'limit',
            'cursor',
          ]
        : ['customers', 'professionals', 'services'].includes(kind ?? '')
          ? ['limit', 'cursor']
          : [];
    for (const key of url.searchParams.keys())
      if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
        throw new Error('VALIDATION_ERROR');
    if (!match)
      return json({
        data: {
          tenantId,
          role: context.selectedRole,
          professionalId: context.professionalId,
        },
        requestId,
        correlationId,
      });
    if (
      kind === 'customers' ||
      kind === 'professionals' ||
      kind === 'services'
    ) {
      const result = await readCatalogPage(
        env,
        kind,
        {
          limit: url.searchParams.get('limit') ?? undefined,
          cursor: url.searchParams.get('cursor') ?? undefined,
        },
        context,
      );
      // Even a synthetic catalog must not become a transport for contact data.
      const data =
        kind === 'customers'
          ? result.data.map((row) => ({
              id: row.id,
              tenantId: row.tenantId,
              fullName: row.fullName,
              status: row.status,
              relationshipProfile: row.relationshipProfile,
              blockedForNewAppointments: row.blockedForNewAppointments,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            }))
          : result.data;
      return json({ ...result, data, requestId, correlationId });
    }
    let data;
    if (kind === 'agenda') {
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
          limit: limit === null ? undefined : Number(limit),
          cursor: url.searchParams.get('cursor') ?? undefined,
        },
        context,
      );
    } else data = await agendaDetails(env, match[3], context);
    assertAgendaRead(data);
    // Selector is never a source of financial snapshots or executable actions.
    const publicAppointment = (
      row: import('@beauty/contracts').AgendaAppointment,
    ) => ({
      id: row.id,
      tenantId: row.tenantId,
      customer: row.customer,
      professional: row.professional,
      service: row.service,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      origin: row.origin,
      basePriceCents: null,
      discountCents: null,
      finalPriceCents: null,
      depositCents: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    const projection =
      'appointments' in data
        ? { ...data, appointments: data.appointments.map(publicAppointment) }
        : { ...publicAppointment(data), allowedActions: [] };
    return json({ data: projection, requestId, correlationId });
  } catch (error) {
    return mappedError(error, requestId, correlationId);
  }
}

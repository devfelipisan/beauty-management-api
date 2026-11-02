import { dispatchEligibleOutbox } from './outbox-coordinator.js';
import { D1ProfileImageRepository } from '@beauty/operations/modules/profile-media/infrastructure/d1-profile-image-repository';
import { profileMediaRoute } from './profile-media-routes.js';
import { executionEnv, scopeEntrypoint } from '@beauty/database/d1/invocation';
import { assertRpcContract } from '@beauty/contracts';
import { observedHttpRequest } from '@beauty/cloudflare-runtime';
import { identityRoute } from './identity-routes.js';
import {
  authorizeSystemDispatch,
  authorizeWorkerRpc,
  bindRpcAuthority,
  userRpcMetadata,
  type UserRpcAuthorityV1,
} from '@beauty/tenancy/adapters/rpc-security';
import { handleServices } from './services/worker-routes.js';
import { serveSwagger } from '@beauty/cloudflare-runtime/swagger';
import { operationsOpenApi } from './openapi.js';
import {
  OperationsComposition,
  invokeCreateAppointment,
  invokeConfirmAppointment,
  invokeCheckInAppointment,
  getRuntime,
} from './composition-root.js';
import type { OperationsEnv } from './env.js';
/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from 'cloudflare:workers';

import {
  workerSecurity,
  requireHttpAuthority,
} from '@beauty/tenancy/adapters/worker-security';
import { dispatchConfiguration } from '@beauty/tenancy/adapters/rpc-security';

import {
  dispatchHealth,
  ids,
  json,
  mappedError,
  notFound,
} from '@beauty/cloudflare-runtime';
import type { CreateAppointmentRequest } from '@beauty/contracts';

export type { OperationsEnv } from './env.js';
function route(path: string) {
  const lifecycle = path.match(
    /^\/tenants\/([^/]+)\/appointments\/([^/]+)\/(confirm|check-in)$/,
  );
  if (lifecycle)
    return {
      kind: lifecycle[3] as 'confirm' | 'check-in',
      tenantId: lifecycle[1],
      appointmentId: lifecycle[2],
    };
  const history = path.match(
    /^\/tenants\/([^/]+)\/customers\/([^/]+)\/history$/,
  );
  if (history)
    return {
      kind: 'history' as const,
      tenantId: history[1],
      customerId: history[2],
    };
  const customer = path.match(/^\/tenants\/([^/]+)\/customers(?:\/([^/]+))?$/);
  if (customer)
    return {
      kind: 'customer' as const,
      tenantId: customer[1],
      customerId: customer[2],
    };
  const appointment = path.match(/^\/tenants\/([^/]+)\/appointments$/);
  return appointment
    ? { kind: 'appointment' as const, tenantId: appointment[1] }
    : null;
}
const appointmentOrigins = new Set([
  'RECEPTION',
  'LANDING_PAGE',
  'WHATSAPP',
  'RETURN',
  'CAMPAIGN',
  'REFERRAL',
  'MANUAL',
]);
function validAppointmentBody(body: unknown): body is CreateAppointmentRequest {
  if (!body || typeof body !== 'object') return false;
  const value = body as Record<string, unknown>;
  const keys = Object.keys(value);
  return (
    keys.length >= 5 &&
    keys.length <= 6 &&
    keys.every((key) =>
      [
        'customerId',
        'serviceId',
        'professionalId',
        'startsAt',
        'origin',
        'customerPackageId',
      ].includes(key),
    ) &&
    ['customerId', 'serviceId', 'professionalId', 'startsAt', 'origin'].every(
      (key) =>
        typeof value[key] === 'string' &&
        Boolean((value[key] as string).trim()),
    ) &&
    (!value.customerPackageId || typeof value.customerPackageId === 'string') &&
    Number.isFinite(Date.parse(value.startsAt as string)) &&
    appointmentOrigins.has(value.origin as string)
  );
}
async function handle(request: Request, env: OperationsEnv): Promise<Response> {
  const health = dispatchHealth(
    request,
    'beauty-operations-worker',
    env.SERVICE_VERSION,
  );
  if (health) return health;
  const found = route(new URL(request.url).pathname);
  if (!found) return notFound();
  const { requestId, correlationId } = ids(request);
  try {
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    const identity = token
      ? await workerSecurity(env).identity.authenticate(token)
      : null;
    if (!identity)
      return json(
        {
          status: 'error',
          code: token ? 'INVALID_AUTHENTICATION' : 'AUTHENTICATION_REQUIRED',
          requestId,
          correlationId,
        },
        401,
      );
    const membership = await workerSecurity(
      env,
    ).membership.findActiveMembership(identity.actorId, found.tenantId);
    if (!membership)
      return json(
        {
          status: 'error',
          code: 'TENANT_ACCESS_DENIED',
          requestId,
          correlationId,
        },
        403,
      );
    if (
      found.kind === 'appointment' ||
      found.kind === 'confirm' ||
      found.kind === 'check-in'
    ) {
      if (request.method.toUpperCase() !== 'POST') return notFound();
      const permission =
        found.kind === 'appointment'
          ? 'appointment.create'
          : found.kind === 'confirm'
            ? 'appointment.confirm'
            : 'appointment.check-in';
      if (!membership.permissions.includes(permission))
        return json(
          {
            status: 'error',
            code: 'PERMISSION_DENIED',
            requestId,
            correlationId,
          },
          403,
        );
      const key = request.headers.get('Idempotency-Key');
      if (!key?.trim())
        return json(
          {
            status: 'error',
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            requestId,
            correlationId,
          },
          400,
        );
      if (found.kind === 'appointment') {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(
            {
              status: 'error',
              code: 'VALIDATION_ERROR',
              requestId,
              correlationId,
            },
            400,
          );
        }
        if (!validAppointmentBody(body))
          return json(
            {
              status: 'error',
              code: 'VALIDATION_ERROR',
              requestId,
              correlationId,
            },
            400,
          );
        if (
          membership.professionalId &&
          body.professionalId !== membership.professionalId
        )
          throw new Error('PERMISSION_DENIED');
        const result = await invokeCreateAppointment(
          bindRpcAuthority(env, userRpcMetadata(request).rpcAuthority),
          {
            ...body,
            tenantId: found.tenantId,
            idempotencyKey: key,
            actorId: identity.actorId,
            requestId,
            correlationId,
          },
        );
        return json({ data: result, requestId, correlationId }, 201);
      }
      const body = await request.text();
      if (body && body !== '{}')
        return json(
          {
            status: 'error',
            code: 'VALIDATION_ERROR',
            requestId,
            correlationId,
          },
          400,
        );
      const input = {
        tenantId: found.tenantId,
        appointmentId: found.appointmentId,
        actorId: identity.actorId,
        idempotencyKey: key,
        requestId,
        correlationId,
      };
      if (
        membership.professionalId &&
        (await new OperationsComposition(env).resourceProfessional(
          input,
          membership.professionalId,
        )) !== membership.professionalId
      )
        throw new Error('PERMISSION_DENIED');
      const result =
        found.kind === 'confirm'
          ? await invokeConfirmAppointment(
              bindRpcAuthority(env, userRpcMetadata(request).rpcAuthority),
              input,
            )
          : await invokeCheckInAppointment(
              bindRpcAuthority(env, userRpcMetadata(request).rpcAuthority),
              input,
            );
      return json({ data: result, requestId, correlationId });
    }
    const method = request.method.toUpperCase();
    if (found.kind === 'history') {
      if (
        method !== 'GET' ||
        !membership.permissions.includes('customer.history.read')
      )
        return json(
          {
            status: 'error',
            code: 'PERMISSION_DENIED',
            requestId,
            correlationId,
          },
          403,
        );
      const u = new URL(request.url);
      if (
        membership.professionalId &&
        u.searchParams.has('professionalId') &&
        u.searchParams.get('professionalId') !== membership.professionalId
      )
        throw new Error('PERMISSION_DENIED');
      const result = await new OperationsComposition(env).listCustomerHistory({
        tenantId: found.tenantId,
        customerId: found.customerId!,
        from: u.searchParams.get('from') ?? undefined,
        to: u.searchParams.get('to') ?? undefined,
        serviceId: u.searchParams.get('serviceId') ?? undefined,
        professionalId:
          membership.professionalId ??
          u.searchParams.get('professionalId') ??
          undefined,
        eventType: u.searchParams.get('eventType') as any,
        status: u.searchParams.get('status') ?? undefined,
        cursor: u.searchParams.get('cursor') ?? undefined,
        limit: Number(u.searchParams.get('limit') ?? 20),
      });
      return json({ data: result, requestId, correlationId });
    }
    const permission =
      method === 'POST'
        ? 'customer.create'
        : method === 'PATCH'
          ? 'customer.update'
          : 'customer.read';
    if (!membership.permissions.includes(permission))
      return json(
        {
          status: 'error',
          code: 'PERMISSION_DENIED',
          requestId,
          correlationId,
        },
        403,
      );
    if (membership.professionalId) throw new Error('PERMISSION_DENIED');
    const app = getRuntime(env);
    let result: unknown;
    if (method === 'GET' && found.customerId)
      result = await app.get.execute(found.tenantId, found.customerId);
    else if (method === 'GET') result = await app.list.execute(found.tenantId);
    else if (method === 'PATCH' && found.customerId) {
      const body = (await request.json()) as Record<string, unknown>;
      const allowed = ['fullName', 'phone', 'email', 'document'];
      if (
        Object.keys(body).some((k) => !allowed.includes(k)) ||
        Object.values(body).some((value) => typeof value !== 'string')
      )
        return json(
          {
            status: 'error',
            code: 'VALIDATION_ERROR',
            requestId,
            correlationId,
          },
          400,
        );
      result = await app.update.execute(
        found.tenantId,
        found.customerId,
        body as never,
        { actorId: identity.actorId, requestId, correlationId },
      );
    } else return notFound();
    if (result === null)
      return json(
        {
          status: 'error',
          code: 'RESOURCE_NOT_FOUND',
          requestId,
          correlationId,
        },
        404,
      );
    const records = Array.isArray(result)
      ? result.map((x) => ({ id: x.id, ...x.data }))
      : [
          {
            id: (result as { id: string }).id,
            ...(result as { data: Record<string, unknown> }).data,
          },
        ];
    const images = await new D1ProfileImageRepository(
      env.D1_DATABASE,
    ).metadataForOwners(
      found.tenantId,
      records.map((x) => x.id),
    );
    const enriched = records.map((record) => ({
      ...record,
      ...(images.has(record.id) ? { profileImage: images.get(record.id) } : {}),
    }));
    return json({
      data: Array.isArray(result) ? enriched : enriched[0],
      requestId,
      correlationId,
    });
  } catch (error) {
    return mappedError(error, requestId, correlationId);
  }
}
export default class OperationsWorker extends WorkerEntrypoint<
  OperationsEnv,
  { caller?: string }
> {
  async scheduled(): Promise<void> {
    // A stale trigger must not process the outbox when explicitly disabled.
    if (this.env.CRONJOB_ENABLED?.trim().toLowerCase() !== 'true') return;
    workerSecurity(executionEnv(this.env));
    const configuration = dispatchConfiguration(executionEnv(this.env));
    const input = { ...configuration, workerId: crypto.randomUUID() };
    type Dispatcher = {
      dispatchOutboxBatch(value: typeof input): Promise<unknown>;
    };
    const results = await dispatchEligibleOutbox(
      executionEnv(this.env).D1_DATABASE,
      new Date().toISOString(),
      {
        operations: () =>
          new OperationsComposition(executionEnv(this.env)).dispatchOutboxBatch(
            input,
          ),
        billing: () =>
          (
            executionEnv(this.env).BILLING_SERVICE as Dispatcher
          ).dispatchOutboxBatch(input),
        clinical: () =>
          (
            executionEnv(this.env).CLINICAL_SERVICE as Dispatcher
          ).dispatchOutboxBatch(input),
      },
    );
    console.log(
      JSON.stringify({
        operation: 'outbox.dispatch',
        version: executionEnv(this.env).SERVICE_VERSION ?? 'local',
        results: results.map((result) =>
          result.status === 'fulfilled'
            ? { status: result.status, summary: result.value }
            : { status: result.status },
        ),
      }),
    );
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('OUTBOX_DISPATCH_FAILED');
  }
  async appointmentChangeRoute(request: Request): Promise<Response | null> {
    const match = new URL(request.url).pathname.match(
      /^\/tenants\/([^/]+)\/appointments\/([^/]+)\/(reschedule|cancel|no-show)$/,
    );
    if (!match) return null;
    const { requestId, correlationId } = ids(request);
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    const identity = token
      ? await workerSecurity(executionEnv(this.env)).identity.authenticate(
          token,
        )
      : null;
    if (!identity)
      return json(
        {
          status: 'error',
          code: token ? 'INVALID_AUTHENTICATION' : 'AUTHENTICATION_REQUIRED',
          requestId,
          correlationId,
        },
        401,
      );
    const membership = await workerSecurity(
      executionEnv(this.env),
    ).membership.findActiveMembership(identity.actorId, match[1]);
    if (!membership)
      return json(
        {
          status: 'error',
          code: 'TENANT_ACCESS_DENIED',
          requestId,
          correlationId,
        },
        403,
      );
    const operation = match[3];
    const permission =
      operation === 'reschedule'
        ? 'appointment.reschedule'
        : operation === 'cancel'
          ? 'appointment.cancel'
          : 'appointment.no-show';
    if (
      request.method.toUpperCase() !== 'POST' ||
      !membership.permissions.includes(permission)
    )
      return json(
        {
          status: 'error',
          code: 'PERMISSION_DENIED',
          requestId,
          correlationId,
        },
        403,
      );
    const key = request.headers.get('Idempotency-Key');
    if (!key?.trim())
      return json(
        {
          status: 'error',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          requestId,
          correlationId,
        },
        400,
      );
    try {
      const body = (await request.json()) as Record<string, unknown>;
      let result: unknown;
      if (operation === 'reschedule') {
        const allowed = ['startsAt', 'professionalId', 'reason'];
        if (
          Object.keys(body).some((k) => !allowed.includes(k)) ||
          typeof body.startsAt !== 'string' ||
          !body.startsAt.trim() ||
          Number.isNaN(Date.parse(body.startsAt)) ||
          typeof body.professionalId !== 'string' ||
          !body.professionalId.trim() ||
          typeof body.reason !== 'string' ||
          !body.reason.trim()
        )
          return json(
            {
              status: 'error',
              code: 'VALIDATION_ERROR',
              requestId,
              correlationId,
            },
            400,
          );
        result = await this.rescheduleAppointment({
          ...userRpcMetadata(request),
          tenantId: match[1],
          appointmentId: match[2],
          startsAt: body.startsAt,
          professionalId: body.professionalId,
          reason: body.reason,
          actorId: identity.actorId,
          idempotencyKey: key,
          requestId,
          correlationId,
        });
      } else if (operation === 'cancel') {
        const allowed = ['origin', 'reason', 'note'];
        if (
          Object.keys(body).some((k) => !allowed.includes(k)) ||
          typeof body.origin !== 'string' ||
          typeof body.reason !== 'string' ||
          !body.reason.trim()
        )
          return json(
            {
              status: 'error',
              code: 'VALIDATION_ERROR',
              requestId,
              correlationId,
            },
            400,
          );
        result = await this.cancelAppointment({
          ...userRpcMetadata(request),
          tenantId: match[1],
          appointmentId: match[2],
          origin: body.origin as never,
          reason: body.reason,
          note: typeof body.note === 'string' ? body.note : undefined,
          actorId: identity.actorId,
          idempotencyKey: key,
          requestId,
          correlationId,
        });
      } else {
        if (Object.keys(body).length > 0)
          return json(
            {
              status: 'error',
              code: 'VALIDATION_ERROR',
              requestId,
              correlationId,
            },
            400,
          );
        result = await this.markAppointmentNoShow({
          ...userRpcMetadata(request),
          tenantId: match[1],
          appointmentId: match[2],
          actorId: identity.actorId,
          idempotencyKey: key,
          requestId,
          correlationId,
        });
      }
      return json({ data: result, requestId, correlationId });
    } catch (error) {
      return mappedError(error, requestId, correlationId);
    }
  }
  packageAssignmentRoute(
    ...args: Parameters<OperationsComposition['packageAssignmentRoute']>
  ) {
    return new OperationsComposition(
      bindRpcAuthority(
        executionEnv(this.env),
        userRpcMetadata(args[0]).rpcAuthority,
      ),
    ).packageAssignmentRoute(...args);
  }
  async fetch(request: any): Promise<any> {
    return observedHttpRequest(
      request,
      'beauty-operations-worker',
      executionEnv(this.env).SERVICE_VERSION,
      executionEnv(this.env).OBSERVE_ENABLED === 'true',
      async (request) => {
        const profile = await profileMediaRoute(
          request,
          executionEnv(this.env),
        );
        if (profile) return profile;
        const identity = await identityRoute(request, executionEnv(this.env));
        if (identity) return identity;
        const docs = serveSwagger(request, operationsOpenApi);
        if (docs) return docs;
        const services = await handleServices(
          request,
          new OperationsComposition(executionEnv(this.env)),
        );
        if (services) return services;
        const change = await this.appointmentChangeRoute(request);
        if (change) return change;
        const assignment = await this.packageAssignmentRoute(request);
        return assignment ?? handle(request, executionEnv(this.env));
      },
      (incoming) => requireHttpAuthority(incoming, executionEnv(this.env)),
    );
  }
  async applyDepositConfirmed(
    ...args: Parameters<OperationsComposition['applyDepositConfirmed']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'DepositConfirmed' },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('applyDepositConfirmed', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applyDepositConfirmed(
      authorized.input as unknown as Parameters<
        OperationsComposition['applyDepositConfirmed']
      >[0],
    );
  }
  async applyDepositExpired(
    ...args: Parameters<OperationsComposition['applyDepositExpired']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'DepositExpired' },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('applyDepositExpired', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applyDepositExpired(
      authorized.input as unknown as Parameters<
        OperationsComposition['applyDepositExpired']
      >[0],
    );
  }
  async getSessionStartContext(
    ...args: Parameters<OperationsComposition['getSessionStartContext']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['session.start'] },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('getSessionStartContext', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).getSessionStartContext(
      authorized.input as unknown as Parameters<
        OperationsComposition['getSessionStartContext']
      >[0],
    );
  }
  async applySessionStarted(
    ...args: Parameters<OperationsComposition['applySessionStarted']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'SessionStarted' },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('applySessionStarted', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applySessionStarted(
      authorized.input as unknown as Parameters<
        OperationsComposition['applySessionStarted']
      >[0],
    );
  }
  async applySessionCompleted(
    ...args: Parameters<OperationsComposition['applySessionCompleted']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'SessionCompleted' },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('applySessionCompleted', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applySessionCompleted(
      authorized.input as unknown as Parameters<
        OperationsComposition['applySessionCompleted']
      >[0],
    );
  }
  async applyClinicalRestriction(
    ...args: Parameters<OperationsComposition['applyClinicalRestriction']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'ClinicalRestrictionActivated' },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('applyClinicalRestriction', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applyClinicalRestriction(
      authorized.input as unknown as Parameters<
        OperationsComposition['applyClinicalRestriction']
      >[0],
    );
  }
  async applyReturnRecommended(
    ...args: Parameters<OperationsComposition['applyReturnRecommended']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'ReturnRecommended' },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('applyReturnRecommended', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applyReturnRecommended(
      authorized.input as unknown as Parameters<
        OperationsComposition['applyReturnRecommended']
      >[0],
    );
  }
  async assignPackageToAppointment(
    ...args: Parameters<OperationsComposition['assignPackageToAppointment']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['appointment.package.assign'] },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('assignPackageToAppointment', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).assignPackageToAppointment(
      authorized.input as unknown as Parameters<
        OperationsComposition['assignPackageToAppointment']
      >[0],
    );
  }
  async applyPackageUnitConsumed(
    ...args: Parameters<OperationsComposition['applyPackageUnitConsumed']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'PackageUnitConsumed' },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('applyPackageUnitConsumed', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applyPackageUnitConsumed(
      authorized.input as unknown as Parameters<
        OperationsComposition['applyPackageUnitConsumed']
      >[0],
    );
  }
  async applyPaymentReceived(
    ...args: Parameters<OperationsComposition['applyPaymentReceived']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'PaymentReceived' },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('applyPaymentReceived', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applyPaymentReceived(
      authorized.input as unknown as Parameters<
        OperationsComposition['applyPaymentReceived']
      >[0],
    );
  }
  async applyRefundIssued(
    ...args: Parameters<OperationsComposition['applyRefundIssued']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'RefundIssued' },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('applyRefundIssued', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applyRefundIssued(
      authorized.input as unknown as Parameters<
        OperationsComposition['applyRefundIssued']
      >[0],
    );
  }
  async rescheduleAppointment(
    ...args: Parameters<OperationsComposition['rescheduleAppointment']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['appointment.reschedule'] },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('rescheduleAppointment', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).rescheduleAppointment(
      authorized.input as unknown as Parameters<
        OperationsComposition['rescheduleAppointment']
      >[0],
    );
  }
  async cancelAppointment(
    ...args: Parameters<OperationsComposition['cancelAppointment']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['appointment.cancel'] },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('cancelAppointment', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).cancelAppointment(
      authorized.input as unknown as Parameters<
        OperationsComposition['cancelAppointment']
      >[0],
    );
  }
  async markAppointmentNoShow(
    ...args: Parameters<OperationsComposition['markAppointmentNoShow']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['appointment.no-show'] },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('markAppointmentNoShow', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).markAppointmentNoShow(
      authorized.input as unknown as Parameters<
        OperationsComposition['markAppointmentNoShow']
      >[0],
    );
  }
  async dispatchOutboxBatch(
    ...args: Parameters<OperationsComposition['dispatchOutboxBatch']>
  ) {
    const input = authorizeSystemDispatch(
      executionEnv(this.env),
      this.ctx.props?.caller,
      args[0],
    );
    return new OperationsComposition(
      executionEnv(this.env),
    ).dispatchOutboxBatch(input);
  }
  async resolveClinicalRestriction(
    ...args: Parameters<OperationsComposition['resolveClinicalRestriction']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'ClinicalRestrictionResolved' },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('resolveClinicalRestriction', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).resolveClinicalRestriction(
      authorized.input as unknown as Parameters<
        OperationsComposition['resolveClinicalRestriction']
      >[0],
    );
  }
  async getServiceTechnicalContext(
    ...args: Parameters<OperationsComposition['getServiceTechnicalContext']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      {
        permissions: [
          'session.start',
          'session.complete',
          'session.technical.update',
          'clinical.photo.read',
          'technical-form.create',
          'technical-form.publish',
        ],
      },
      args[0],
      (value, professionalId) =>
        new OperationsComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('getServiceTechnicalContext', authorized.input);
    return new OperationsComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).getServiceTechnicalContext(
      authorized.input as unknown as Parameters<
        OperationsComposition['getServiceTechnicalContext']
      >[0],
    );
  }
}

export {
  invokeClinicalAssessment,
  invokeCommercialTerms,
} from './composition-root.js';

scopeEntrypoint(OperationsWorker);

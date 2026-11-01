import {
  executionEnv,
  scopeEntrypoint,
  scopeInvocation,
} from '@beauty/database/d1/invocation';
import { assertRpcContract } from '@beauty/contracts';
import { observedHttpRequest } from '@beauty/cloudflare-runtime';
import {
  authorizeSystemDispatch,
  authorizeWorkerRpc,
  bindRpcAuthority,
  userRpcMetadata,
  type UserRpcAuthorityV1,
} from '@beauty/tenancy/adapters/rpc-security';
import { serveSwagger } from '@beauty/cloudflare-runtime/swagger';
import { clinicalOpenApi } from './openapi.js';
import { ClinicalComposition } from './composition-root.js';
import type { ClinicalEnv } from './env.js';
/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from 'cloudflare:workers';
import {
  dispatchHealth,
  ids,
  json,
  mappedError,
  notFound,
} from '@beauty/cloudflare-runtime';
import {
  workerSecurity,
  requireHttpAuthority,
} from '@beauty/tenancy/adapters/worker-security';

export type { ClinicalEnv } from './env.js';
export default class ClinicalWorker extends WorkerEntrypoint<
  ClinicalEnv,
  { caller?: string }
> {
  constructor(ctx: ExecutionContext, env: ClinicalEnv) {
    super(ctx, env);
    const original = this.fetch.bind(this);
    this.fetch = async (request: Request) => {
      try {
        const returned = await this.handleReturnRoute(request);
        if (returned) return returned;
        const completion = await this.handleCompletionRoute(request);
        if (completion) return completion;
        const media = await this.handleMediaRoute(request);
        return await (media ?? original(request));
      } catch (error) {
        const { requestId, correlationId } = ids(request);
        return mappedError(error, requestId, correlationId);
      }
    };
    const instrumented = this.fetch.bind(this);
    this.fetch = (request: Request) =>
      observedHttpRequest(
        request,
        'beauty-clinical-worker',
        executionEnv(this.env).SERVICE_VERSION,
        executionEnv(this.env).OBSERVE_ENABLED === 'true',
        instrumented,
        (incoming) => requireHttpAuthority(incoming, executionEnv(this.env)),
      );
    this.fetch = scopeInvocation(this.fetch);
    this.fetch = scopeInvocation(this.fetch);
  }
  async handleReturnRoute(request: Request): Promise<Response | null> {
    const match = new URL(request.url).pathname.match(
      /^\/tenants\/([^/]+)\/sessions\/([^/]+)\/return-recommendation$/,
    );
    if (!match) return null;
    const { requestId, correlationId } = ids(request);
    const auth = await this.auth(request, match[1]);
    if (!auth)
      return json(
        {
          status: 'error',
          code: 'AUTHENTICATION_REQUIRED',
          requestId,
          correlationId,
        },
        401,
      );
    if (request.method !== 'POST') return notFound();
    if (!auth.membership.permissions.includes('session.complete'))
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
      const body = (await request.json()) as any;
      return json({
        data: await this.recommendReturn({
          ...body,
          ...userRpcMetadata(request),
          tenantId: match[1],
          sessionId: match[2],
          actorId: auth.identity.actorId,
          idempotencyKey: key,
          requestId,
          correlationId,
        }),
        requestId,
        correlationId,
      });
    } catch (error) {
      return mappedError(error, requestId, correlationId);
    }
  }
  async handleCompletionRoute(request: Request): Promise<Response | null> {
    const path = new URL(request.url).pathname;
    const match = path.match(
      /^\/tenants\/([^/]+)\/sessions\/([^/]+)\/completion-eligibility$/,
    );
    const complete = path.match(
      /^\/tenants\/([^/]+)\/sessions\/([^/]+)\/complete$/,
    );
    if (!match && !complete) return null;
    const route = match ?? complete!;
    const tenantId = route[1];
    const { requestId, correlationId } = ids(request);
    const auth = await this.auth(request, tenantId);
    if (!auth)
      return json(
        {
          status: 'error',
          code: 'AUTHENTICATION_REQUIRED',
          requestId,
          correlationId,
        },
        401,
      );
    try {
      const actorId = auth.identity.actorId;
      if (match) {
        if (request.method !== 'GET') return notFound();
        if (!auth.membership.permissions.includes('session.complete'))
          return json(
            {
              status: 'error',
              code: 'PERMISSION_DENIED',
              requestId,
              correlationId,
            },
            403,
          );
        return json({
          data: await this.checkSessionCompletionEligibility({
            ...userRpcMetadata(request),
            tenantId,
            sessionId: route[2],
            actorId,
          }),
          requestId,
          correlationId,
        });
      }
      if (request.method !== 'POST') return notFound();
      if (!auth.membership.permissions.includes('session.complete'))
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
      return json({
        data: await this.completeSession({
          ...userRpcMetadata(request),
          tenantId,
          sessionId: route[2],
          actorId,
          idempotencyKey: key,
          requestId,
          correlationId,
        }),
        requestId,
        correlationId,
      });
    } catch (error) {
      return mappedError(error, requestId, correlationId);
    }
  }
  async handleMediaRoute(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const list = url.pathname.match(
      /^\/tenants\/([^/]+)\/sessions\/([^/]+)\/photos$/,
    );
    const item = url.pathname.match(
      /^\/tenants\/([^/]+)\/sessions\/([^/]+)\/photos\/([^/]+)$/,
    );
    if (!list && !item) return null;
    const route = list ?? item!;
    const tenantId = route[1];
    const { requestId, correlationId } = ids(request);
    const auth = await this.auth(request, tenantId);
    if (!auth)
      return json(
        {
          status: 'error',
          code: 'AUTHENTICATION_REQUIRED',
          requestId,
          correlationId,
        },
        401,
      );
    try {
      const actorId = auth.identity.actorId;
      if (request.method === 'GET' && !item) {
        if (!auth.membership.permissions.includes('clinical.photo.read'))
          return json(
            {
              status: 'error',
              code: 'PERMISSION_DENIED',
              requestId,
              correlationId,
            },
            403,
          );
        return json({
          data: await this.listSessionPhotos({
            ...userRpcMetadata(request),
            tenantId,
            sessionId: route[2],
            actorId,
          }),
          requestId,
          correlationId,
        });
      }
      if (request.method === 'GET' && item) {
        if (!auth.membership.permissions.includes('clinical.photo.read'))
          return json(
            {
              status: 'error',
              code: 'PERMISSION_DENIED',
              requestId,
              correlationId,
            },
            403,
          );
        const result = await this.getClinicalPhoto({
          ...userRpcMetadata(request),
          tenantId,
          sessionId: route[2],
          photoId: route[3],
          actorId,
        });
        const h = new Headers({
          'content-type':
            result.object.contentType ?? result.metadata.contentType,
          'content-length': String(result.object.size),
          'cache-control': 'private, no-store',
        });
        if (result.object.etag) h.set('etag', result.object.etag);
        return new Response(result.object.body, { headers: h });
      }
      if (!list || request.method !== 'POST') return notFound();
      if (!auth.membership.permissions.includes('clinical.photo.upload'))
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
      const contentLength = request.headers.get('content-length');
      const result = await this.uploadSessionPhoto({
        ...userRpcMetadata(request),
        tenantId,
        sessionId: route[2],
        intercurrenceId: url.searchParams.get('intercurrenceId') ?? undefined,
        purpose: url.searchParams.get('purpose') as any,
        contentType: request.headers.get('content-type') ?? '',
        contentLength: contentLength ? Number(contentLength) : undefined,
        clientChecksum: request.headers.get('x-content-checksum') ?? undefined,
        actorId,
        idempotencyKey: key,
        requestId,
        correlationId,
        body: request.body ?? new ReadableStream(),
        maxBytes: 0,
      });
      return json({ data: result, requestId, correlationId }, 201);
    } catch (error) {
      return mappedError(error, requestId, correlationId);
    }
  }
  async auth(request: Request, tenantId: string) {
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    const identity = token
      ? await workerSecurity(executionEnv(this.env)).identity.authenticate(
          token,
        )
      : null;
    if (!identity) return null;
    const membership = await workerSecurity(
      executionEnv(this.env),
    ).membership.findActiveMembership(identity.actorId, tenantId);
    if (!membership) throw new Error('TENANT_ACCESS_DENIED');
    return { identity, membership };
  }
  async handleEquipmentRoute(request: Request): Promise<Response | null> {
    const path = new URL(request.url).pathname;
    const equipment = path.match(/^\/tenants\/([^/]+)\/equipment$/);
    const services = path.match(
      /^\/tenants\/([^/]+)\/equipment\/([^/]+)\/services$/,
    );
    const usage = path.match(
      /^\/tenants\/([^/]+)\/sessions\/([^/]+)\/equipment-usages$/,
    );
    const previous = path.match(
      /^\/tenants\/([^/]+)\/sessions\/([^/]+)\/previous-context$/,
    );
    const policy = path.match(/^\/tenants\/([^/]+)\/variation-policies$/);
    const justify = path.match(
      /^\/tenants\/([^/]+)\/sessions\/([^/]+)\/variation-alerts\/([^/]+)\/justify$/,
    );
    if (!equipment && !services && !usage && !previous && !policy && !justify)
      return null;
    const route =
      equipment ?? services ?? usage ?? previous ?? policy ?? justify!;
    const tenantId = route[1];
    const auth = await this.auth(request, tenantId);
    const { requestId, correlationId } = ids(request);
    if (!auth)
      return json(
        {
          status: 'error',
          code: 'AUTHENTICATION_REQUIRED',
          requestId,
          correlationId,
        },
        401,
      );
    const actorId = auth.identity.actorId;
    const key = request.headers.get('Idempotency-Key');
    const body = async () => {
      try {
        return (await request.json()) as any;
      } catch {
        return null;
      }
    };
    try {
      if (equipment) {
        if (
          !auth.membership.permissions.includes(
            request.method === 'GET' ? 'equipment.read' : 'equipment.create',
          )
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
        if (request.method === 'GET')
          return json({
            data: await new ClinicalComposition(
              executionEnv(this.env),
            ).getEquipment(tenantId, (await body())?.id),
            requestId,
            correlationId,
          });
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
        return json(
          {
            data: await this.createEquipment({
              ...userRpcMetadata(request),
              tenantId,
              actorId,
              idempotencyKey: key,
              requestId,
              correlationId,
              equipment: await body(),
            }),
            requestId,
            correlationId,
          },
          201,
        );
      }
      if (services) {
        if (!auth.membership.permissions.includes('equipment.update'))
          return json(
            {
              status: 'error',
              code: 'PERMISSION_DENIED',
              requestId,
              correlationId,
            },
            403,
          );
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
        return json({
          data: await this.configureEquipmentServices({
            ...userRpcMetadata(request),
            tenantId,
            equipmentId: services[2],
            serviceIds: (await body())?.serviceIds ?? [],
            actorId,
            idempotencyKey: key,
            requestId,
            correlationId,
          }),
          requestId,
          correlationId,
        });
      }
      if (previous)
        return json({
          data: await this.getPreviousSessionContext({
            ...userRpcMetadata(request),
            tenantId,
            sessionId: previous[2],
            actorId,
          }),
          requestId,
          correlationId,
        });
      if (usage) {
        if (!auth.membership.permissions.includes('session.technical.update'))
          return json(
            {
              status: 'error',
              code: 'PERMISSION_DENIED',
              requestId,
              correlationId,
            },
            403,
          );
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
        return json({
          data: await this.recordSessionEquipmentUsage({
            ...userRpcMetadata(request),
            tenantId,
            sessionId: usage[2],
            equipmentId: (await body())?.equipmentId,
            actorId,
            idempotencyKey: key,
            requestId,
            correlationId,
          }),
          requestId,
          correlationId,
        });
      }
      if (policy) {
        if (!auth.membership.permissions.includes('variation-policy.configure'))
          return json(
            {
              status: 'error',
              code: 'PERMISSION_DENIED',
              requestId,
              correlationId,
            },
            403,
          );
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
        return json({
          data: await this.configureVariationPolicy({
            ...(await body()),
            ...userRpcMetadata(request),
            tenantId,
            actorId,
            idempotencyKey: key,
            requestId,
            correlationId,
          }),
          requestId,
          correlationId,
        });
      }
      if (!auth.membership.permissions.includes('session.technical.update'))
        return json(
          {
            status: 'error',
            code: 'PERMISSION_DENIED',
            requestId,
            correlationId,
          },
          403,
        );
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
      return json({
        data: await this.justifyVariationAlert({
          ...(await body()),
          ...userRpcMetadata(request),
          tenantId,
          sessionId: justify![2],
          alertId: justify![3],
          actorId,
          idempotencyKey: key,
          requestId,
          correlationId,
        }),
        requestId,
        correlationId,
      });
    } catch (error) {
      return mappedError(error, requestId, correlationId);
    }
  }
  async fetch(request: any): Promise<any> {
    const docs = serveSwagger(request, clinicalOpenApi);
    if (docs) return docs;
    const health = dispatchHealth(
      request,
      'beauty-clinical-worker',
      executionEnv(this.env).SERVICE_VERSION,
    );
    if (health) return health;
    const pr18 = await this.handleEquipmentRoute(request);
    if (pr18) return pr18;
    const path = new URL(request.url).pathname;
    const start = path.match(
      /^\/tenants\/([^/]+)\/appointments\/([^/]+)\/session\/start$/,
    );
    const form = path.match(
      /^\/tenants\/([^/]+)\/services\/([^/]+)\/technical-forms(?:\/([^/]+)\/publish)?$/,
    );
    const values = path.match(
      /^\/tenants\/([^/]+)\/sessions\/([^/]+)\/(technical-values|power)$/,
    );
    if (!start && !form && !values) return notFound();
    const route = start ?? form ?? values!;
    const tenantId = route[1];
    const { requestId, correlationId } = ids(request);
    try {
      const auth = await this.auth(request, tenantId);
      if (!auth)
        return json(
          {
            status: 'error',
            code: 'AUTHENTICATION_REQUIRED',
            requestId,
            correlationId,
          },
          401,
        );
      const actorId = auth.identity.actorId;
      if (start) {
        if (!auth.membership.permissions.includes('session.start'))
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
        return json(
          {
            data: await this.startSession({
              ...userRpcMetadata(request),
              tenantId,
              appointmentId: start[2],
              actorId,
              idempotencyKey: key,
              requestId,
              correlationId,
            }),
            requestId,
            correlationId,
          },
          201,
        );
      }
      if (form) {
        const publish = Boolean(form[3]);
        const permission = publish
          ? 'technical-form.publish'
          : request.method === 'GET'
            ? 'technical-form.read'
            : 'technical-form.create';
        if (!auth.membership.permissions.includes(permission))
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
        if (request.method !== 'GET' && !key?.trim())
          return json(
            {
              status: 'error',
              code: 'IDEMPOTENCY_KEY_REQUIRED',
              requestId,
              correlationId,
            },
            400,
          );
        if (request.method === 'GET') {
          const x = await new ClinicalComposition(
            executionEnv(this.env),
          ).getActiveTechnicalForm(tenantId, form[2]);
          return x
            ? json({ data: x, requestId, correlationId })
            : json(
                {
                  status: 'error',
                  code: 'TECHNICAL_FORM_NOT_FOUND',
                  requestId,
                  correlationId,
                },
                404,
              );
        }
        if (publish)
          return json({
            data: await this.publishTechnicalForm({
              ...userRpcMetadata(request),
              tenantId,
              formId: form[3]!,
              actorId,
              idempotencyKey: key!,
              requestId,
              correlationId,
            }),
            requestId,
            correlationId,
          });
        const body = await request.json();
        return json(
          {
            data: await this.createTechnicalForm({
              ...body,
              ...userRpcMetadata(request),
              tenantId,
              serviceId: form[2],
              actorId,
              idempotencyKey: key!,
              requestId,
              correlationId,
            }),
            requestId,
            correlationId,
          },
          201,
        );
      }
      if (!auth.membership.permissions.includes('session.technical.update'))
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
      const body = await request.json();
      if (values![3] === 'technical-values')
        return json({
          data: await this.recordSessionTechnicalValues({
            ...body,
            ...userRpcMetadata(request),
            tenantId,
            sessionId: values![2],
            actorId,
            idempotencyKey: key,
            requestId,
            correlationId,
          }),
          requestId,
          correlationId,
        });
      return json({
        data: await this.recordSessionPower({
          ...body,
          ...userRpcMetadata(request),
          tenantId,
          sessionId: values![2],
          actorId,
          idempotencyKey: key,
          requestId,
          correlationId,
        }),
        requestId,
        correlationId,
      });
    } catch (error) {
      return mappedError(error, requestId, correlationId);
    }
  }
  async checkAssessmentEligibility(
    ...args: Parameters<ClinicalComposition['checkAssessmentEligibility']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['appointment.create'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('checkAssessmentEligibility', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).checkAssessmentEligibility(
      authorized.input as unknown as Parameters<
        ClinicalComposition['checkAssessmentEligibility']
      >[0],
    );
  }
  async startSession(...args: Parameters<ClinicalComposition['startSession']>) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['session.start'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('startSession', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).startSession(
      authorized.input as unknown as Parameters<
        ClinicalComposition['startSession']
      >[0],
    );
  }
  async getSessionStartContext(
    ...args: Parameters<ClinicalComposition['getSessionStartContext']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['session.start'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('getSessionStartContext', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).getSessionStartContext(
      authorized.input as unknown as Parameters<
        ClinicalComposition['getSessionStartContext']
      >[0],
    );
  }
  async dispatchOutboxBatch(
    ...args: Parameters<ClinicalComposition['dispatchOutboxBatch']>
  ) {
    const input = authorizeSystemDispatch(
      executionEnv(this.env),
      this.ctx.props?.caller,
      args[0],
    );
    return new ClinicalComposition(executionEnv(this.env)).dispatchOutboxBatch(
      input,
    );
  }
  async createTechnicalForm(
    ...args: Parameters<ClinicalComposition['createTechnicalForm']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['technical-form.create'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('createTechnicalForm', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).createTechnicalForm(
      authorized.input as unknown as Parameters<
        ClinicalComposition['createTechnicalForm']
      >[0],
    );
  }
  async publishTechnicalForm(
    ...args: Parameters<ClinicalComposition['publishTechnicalForm']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['technical-form.publish'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('publishTechnicalForm', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).publishTechnicalForm(
      authorized.input as unknown as Parameters<
        ClinicalComposition['publishTechnicalForm']
      >[0],
    );
  }
  async recordSessionTechnicalValues(
    ...args: Parameters<ClinicalComposition['recordSessionTechnicalValues']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['session.technical.update'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('recordSessionTechnicalValues', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).recordSessionTechnicalValues(
      authorized.input as unknown as Parameters<
        ClinicalComposition['recordSessionTechnicalValues']
      >[0],
    );
  }
  async recordSessionPower(
    ...args: Parameters<ClinicalComposition['recordSessionPower']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['session.technical.update'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('recordSessionPower', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).recordSessionPower(
      authorized.input as unknown as Parameters<
        ClinicalComposition['recordSessionPower']
      >[0],
    );
  }
  async createEquipment(
    ...args: Parameters<ClinicalComposition['createEquipment']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['equipment.create'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('createEquipment', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).createEquipment(
      authorized.input as unknown as Parameters<
        ClinicalComposition['createEquipment']
      >[0],
    );
  }
  async configureEquipmentServices(
    ...args: Parameters<ClinicalComposition['configureEquipmentServices']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['equipment.update'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('configureEquipmentServices', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).configureEquipmentServices(
      authorized.input as unknown as Parameters<
        ClinicalComposition['configureEquipmentServices']
      >[0],
    );
  }
  async changeEquipmentStatus(
    ...args: Parameters<ClinicalComposition['changeEquipmentStatus']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['equipment.status.change'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('changeEquipmentStatus', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).changeEquipmentStatus(
      authorized.input as unknown as Parameters<
        ClinicalComposition['changeEquipmentStatus']
      >[0],
    );
  }
  async recordSessionEquipmentUsage(
    ...args: Parameters<ClinicalComposition['recordSessionEquipmentUsage']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['session.technical.update'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('recordSessionEquipmentUsage', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).recordSessionEquipmentUsage(
      authorized.input as unknown as Parameters<
        ClinicalComposition['recordSessionEquipmentUsage']
      >[0],
    );
  }
  async getPreviousSessionContext(
    ...args: Parameters<ClinicalComposition['getPreviousSessionContext']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['session.technical.update'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('getPreviousSessionContext', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).getPreviousSessionContext(
      authorized.input as unknown as Parameters<
        ClinicalComposition['getPreviousSessionContext']
      >[0],
    );
  }
  async configureVariationPolicy(
    ...args: Parameters<ClinicalComposition['configureVariationPolicy']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['variation-policy.configure'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('configureVariationPolicy', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).configureVariationPolicy(
      authorized.input as unknown as Parameters<
        ClinicalComposition['configureVariationPolicy']
      >[0],
    );
  }
  async justifyVariationAlert(
    ...args: Parameters<ClinicalComposition['justifyVariationAlert']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['session.technical.update'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('justifyVariationAlert', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).justifyVariationAlert(
      authorized.input as unknown as Parameters<
        ClinicalComposition['justifyVariationAlert']
      >[0],
    );
  }
  async reportIntercurrence(
    ...args: Parameters<ClinicalComposition['reportIntercurrence']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['intercurrence.report'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('reportIntercurrence', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).reportIntercurrence(
      authorized.input as unknown as Parameters<
        ClinicalComposition['reportIntercurrence']
      >[0],
    );
  }
  async resolveIntercurrence(
    ...args: Parameters<ClinicalComposition['resolveIntercurrence']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['intercurrence.resolve'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('resolveIntercurrence', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).resolveIntercurrence(
      authorized.input as unknown as Parameters<
        ClinicalComposition['resolveIntercurrence']
      >[0],
    );
  }
  async uploadSessionPhoto(
    ...args: Parameters<ClinicalComposition['uploadSessionPhoto']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['clinical.photo.upload'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('uploadSessionPhoto', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).uploadSessionPhoto(
      authorized.input as unknown as Parameters<
        ClinicalComposition['uploadSessionPhoto']
      >[0],
    );
  }
  async listSessionPhotos(
    ...args: Parameters<ClinicalComposition['listSessionPhotos']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['clinical.photo.read'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('listSessionPhotos', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).listSessionPhotos(
      authorized.input as unknown as Parameters<
        ClinicalComposition['listSessionPhotos']
      >[0],
    );
  }
  async getClinicalPhoto(
    ...args: Parameters<ClinicalComposition['getClinicalPhoto']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['clinical.photo.read'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('getClinicalPhoto', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).getClinicalPhoto(
      authorized.input as unknown as Parameters<
        ClinicalComposition['getClinicalPhoto']
      >[0],
    );
  }
  async reconcilePhotoAttachment(
    ...args: Parameters<ClinicalComposition['reconcilePhotoAttachment']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      {},
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).reconcilePhotoAttachment(
      authorized.input as unknown as Parameters<
        ClinicalComposition['reconcilePhotoAttachment']
      >[0],
    );
  }
  async evaluateSessionPhotoRequirement(
    ...args: Parameters<ClinicalComposition['evaluateSessionPhotoRequirement']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['clinical.photo.read'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('evaluateSessionPhotoRequirement', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).evaluateSessionPhotoRequirement(
      authorized.input as unknown as Parameters<
        ClinicalComposition['evaluateSessionPhotoRequirement']
      >[0],
    );
  }
  async checkSessionCompletionEligibility(
    ...args: Parameters<
      ClinicalComposition['checkSessionCompletionEligibility']
    >
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['session.complete'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('checkSessionCompletionEligibility', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).checkSessionCompletionEligibility(
      authorized.input as unknown as Parameters<
        ClinicalComposition['checkSessionCompletionEligibility']
      >[0],
    );
  }
  async completeSession(
    ...args: Parameters<ClinicalComposition['completeSession']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['session.complete'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('completeSession', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).completeSession(
      authorized.input as unknown as Parameters<
        ClinicalComposition['completeSession']
      >[0],
    );
  }
  async recommendReturn(
    ...args: Parameters<ClinicalComposition['recommendReturn']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['session.complete'] },
      args[0],
      (value, professionalId) =>
        new ClinicalComposition(
          bindRpcAuthority(
            executionEnv(this.env),
            (value as { rpcAuthority?: UserRpcAuthorityV1 }).rpcAuthority,
          ),
        ).resourceProfessional(value, professionalId),
    );
    assertRpcContract('recommendReturn', authorized.input);
    return new ClinicalComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).recommendReturn(
      authorized.input as unknown as Parameters<
        ClinicalComposition['recommendReturn']
      >[0],
    );
  }
}

scopeEntrypoint(ClinicalWorker);

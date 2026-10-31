import { publicErrorStatus } from './public-errors.js';

export async function observedHttpRequest(
  request: Request,
  service: string,
  version: string | undefined,
  enabled: boolean,
  handle: (request: Request) => Promise<Response>,
  authorizeBeforeValidation?: (request: Request) => Promise<void>,
): Promise<Response> {
  const context = ids(request);
  const headers = new Headers(request.headers);
  headers.set('x-request-id', context.requestId);
  headers.set('x-correlation-id', context.correlationId);
  const started = Date.now();
  let response: Response;
  try {
    const binaryPhoto = /\/sessions\/[^/]+\/photos$/.test(
      new URL(request.url).pathname,
    );
    if (
      request.body &&
      !['GET', 'HEAD'].includes(request.method) &&
      !binaryPhoto
    ) {
      await authorizeBeforeValidation?.(request);
      let body: unknown;
      try {
        body = await request.clone().json();
      } catch {
        throw new Error('VALIDATION_ERROR');
      }
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some((key) =>
          [
            'tenantId',
            'actorId',
            'requestId',
            'correlationId',
            'idempotencyKey',
            'rpcAuthority',
            'roles',
            'permissions',
            'authorization',
          ].includes(key),
        )
      )
        throw new Error('VALIDATION_ERROR');
    }
    response = await handle(new Request(request, { headers }));
  } catch (error) {
    response = mappedError(error, context.requestId, context.correlationId);
  }
  if (enabled)
    console.log(
      JSON.stringify({
        operation: 'http.request',
        service,
        version: version ?? 'local',
        method: request.method,
        status: response.status,
        durationMs: Date.now() - started,
        ...context,
      }),
    );
  return response;
}
export interface WorkerRuntimeEnv {
  [key: string]: unknown;
}
export function json(data: unknown, status = 200): Response {
  const value = data as { requestId?: string; correlationId?: string };
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
  });
  if (value?.requestId) headers.set('x-request-id', value.requestId);
  if (value?.correlationId)
    headers.set('x-correlation-id', value.correlationId);
  return new Response(JSON.stringify(data), { status, headers });
}
export function dispatchHealth(
  request: Request,
  service: string,
  version = 'local',
): Response | undefined {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health')
    return json({ status: 'ok', service, version });
  return undefined;
}
export function notFound(): Response {
  return json({ status: 'error', code: 'NOT_FOUND' }, 404);
}
export function ids(request: Request): {
  requestId: string;
  correlationId: string;
} {
  const requestId =
    request.headers
      .get('x-request-id')
      ?.match(/^[A-Za-z0-9._:-]{1,128}$/)?.[0] ?? crypto.randomUUID();
  const correlationId =
    request.headers
      .get('x-correlation-id')
      ?.match(/^[A-Za-z0-9._:-]{1,128}$/)?.[0] ?? requestId;
  return { requestId, correlationId };
}
export function mappedError(
  error: unknown,
  requestId: string,
  correlationId: string,
): Response {
  const candidate =
    error && typeof error === 'object'
      ? (error as { code?: unknown }).code
      : undefined;
  const value =
    typeof candidate === 'string'
      ? candidate
      : error instanceof Error
        ? error.message
        : '';
  const status = Object.hasOwn(publicErrorStatus, value)
    ? publicErrorStatus[value]
    : 500;
  const code = status === 500 ? 'INTERNAL_ERROR' : value;
  const reasons =
    error && typeof error === 'object'
      ? (error as { reasons?: unknown }).reasons
      : undefined;
  return json(
    {
      status: 'error',
      code,
      message: status === 500 ? 'Internal error' : code,
      ...(status !== 500 && Array.isArray(reasons) ? { reasons } : {}),
      requestId,
      correlationId,
    },
    status,
  );
}

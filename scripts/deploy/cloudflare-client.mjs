import { fail } from './errors.mjs';
export function cloudflareClient({
  accountId,
  apiToken,
  fetchImpl = globalThis.fetch,
  context = {},
}) {
  if (
    !/^[A-Za-z0-9_-]+$/.test(accountId ?? '') ||
    typeof apiToken !== 'string' ||
    !apiToken.trim()
  )
    fail('REMOTE_CREDENTIALS_UNAVAILABLE', context);
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`;
  const metrics = { calls: 0, operations: {}, phases: {}, durationMs: 0 };
  const cache = new Map();
  async function request(
    path,
    { operation, worker, phase = context.phase, body, cacheResult = true } = {},
  ) {
    const scope = { ...context, phase, operation, worker };
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('://') ||
      (body && (!/^\s*SELECT\b/i.test(body.sql ?? '') || /;/.test(body.sql)))
    )
      fail('INVALID_REQUEST', scope);
    const key = JSON.stringify([path, body]);
    if (cacheResult && cache.has(key)) return cache.get(key);
    const promise = (async () => {
      const start = performance.now();
      metrics.calls++;
      metrics.operations[operation] = (metrics.operations[operation] ?? 0) + 1;
      metrics.phases[phase] = (metrics.phases[phase] ?? 0) + 1;
      try {
        let response;
        try {
          response = await fetchImpl(base + path, {
            method: body ? 'POST' : 'GET',
            redirect: 'error',
            headers: {
              authorization: `Bearer ${apiToken}`,
              ...(body ? { 'content-type': 'application/json' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
        } catch {
          fail('REMOTE_TRANSPORT_ERROR', scope);
        }
        if (!response.ok)
          fail(
            response.status === 401
              ? 'REMOTE_UNAUTHENTICATED'
              : response.status === 403
                ? 'REMOTE_ACCESS_DENIED'
                : response.status === 404
                  ? 'REMOTE_RESOURCE_UNAVAILABLE'
                  : 'REMOTE_HTTP_ERROR',
            { ...scope, status: response.status },
          );
        let data;
        try {
          data = await response.json();
        } catch {
          fail('REMOTE_RESPONSE_INVALID', scope);
        }
        if (data?.success !== true) fail('REMOTE_RESPONSE_INVALID', scope);
        return data.result;
      } finally {
        metrics.durationMs += performance.now() - start;
      }
    })();
    if (cacheResult) cache.set(key, promise);
    return promise;
  }
  return {
    request,
    metrics,
    invalidate() {
      cache.clear();
    },
  };
}

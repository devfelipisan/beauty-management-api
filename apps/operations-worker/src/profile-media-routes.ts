import { observeMediaCapacity } from '@beauty/reliability/media/observe-media-capacity';
import { ids, json, mappedError, notFound } from '@beauty/cloudflare-runtime';
import { authorizeActor } from '@beauty/kernel/application/actor-authorization';
import { workerSecurity } from '@beauty/tenancy/adapters/worker-security';
import { PROFILE_IMAGE_MAX_BYTES } from '@beauty/operations/modules/profile-media/domain/profile-image';
import { OperationsComposition } from './composition-root.js';
import type { OperationsEnv } from './env.js';

export async function profileMediaRoute(
  request: Request,
  env: OperationsEnv,
): Promise<Response | null> {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/tenants\/([^/]+)\/profile-images\/customer\/([^/]+)$/,
    );
  if (!match) return null;
  const context = ids(request);
  try {
    if (!['GET', 'PUT', 'DELETE'].includes(request.method)) return notFound();
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!token) throw new Error('AUTHENTICATION_REQUIRED');
    const security = workerSecurity(env),
      identity = await security.identity.authenticate(token);
    if (!identity) throw new Error('INVALID_AUTHENTICATION');
    const membership = await security.membership.findActiveMembership(
      identity.actorId,
      match[1],
    );
    if (!membership) throw new Error('TENANT_ACCESS_DENIED');
    if (
      membership.professionalId ||
      !membership.permissions.includes(
        request.method === 'GET' ? 'customer.read' : 'customer.update',
      )
    )
      throw new Error('PERMISSION_DENIED');
    const app = new OperationsComposition(env).profileImages();
    const actor = {
      tenantId: match[1],
      ownerId: match[2],
      actorId: identity.actorId,
      ...context,
    };
    const scope = { tenantId: actor.tenantId, actorId: actor.actorId };
    if (request.method === 'GET') {
      const version = url.searchParams.get('version');
      if (version !== null && !/^[1-9]\d*$/.test(version))
        throw new Error('VALIDATION_ERROR');
      const { image, object } = await app.get(
        authorizeActor(
          {
            ...actor,
            version: version === null ? undefined : Number(version),
            etag: request.headers.get('if-none-match') ?? undefined,
          },
          scope,
        ),
      );
      const cacheHeaders = {
        'cache-control': 'private, no-cache',
        etag: `"${image.version}"`,
        'x-content-type-options': 'nosniff',
      };
      if (!object)
        return new Response(null, { status: 304, headers: cacheHeaders });
      return new Response(object.body, {
        headers: {
          ...cacheHeaders,
          'content-type': image.contentType,
          'content-length': String(object.size),
        },
      });
    }
    const expected = request.headers.get('if-match');
    if (!expected || !/^"\d+"$/.test(expected))
      throw new Error('VALIDATION_ERROR');
    const mutation = {
      ...actor,
      expectedVersion: Number(expected.slice(1, -1)),
      idempotencyKey: request.headers.get('idempotency-key') ?? '',
    };
    if (request.method === 'DELETE') {
      const data = await app.remove(authorizeActor(mutation, scope));
      await observeMediaCapacity(
        env.D1_DATABASE,
        env.OBSERVE_ENABLED === 'true',
      );
      return json({ data, ...context });
    }
    if (env.MAX_PROFILE_IMAGE_BYTES !== String(PROFILE_IMAGE_MAX_BYTES))
      throw new Error('INVALID_PROFILE_MEDIA_CONFIGURATION');
    const contentType = request.headers.get('content-type') ?? '';
    const declared = request.headers.get('content-length');
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > PROFILE_IMAGE_MAX_BYTES)
    )
      throw new Error('PHOTO_SIZE_EXCEEDED');
    if (!request.body) throw new Error('PHOTO_CONTENT_INVALID');
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > PROFILE_IMAGE_MAX_BYTES)
          throw new Error('PHOTO_SIZE_EXCEEDED');
        chunks.push(next.value);
      }
    } catch (error) {
      await reader.cancel(error).catch(() => undefined);
      throw error;
    }
    if (declared !== null && Number(declared) !== size)
      throw new Error('PHOTO_CONTENT_LENGTH_MISMATCH');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const checksum = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const result = await app.upload(
      authorizeActor(
        { ...mutation, contentType, sizeBytes: size, checksum, body },
        scope,
      ),
    );
    await observeMediaCapacity(env.D1_DATABASE, env.OBSERVE_ENABLED === 'true');
    return json({ data: result, ...context });
  } catch (error) {
    return mappedError(error, context.requestId, context.correlationId);
  }
}

import {
  workerSecurity,
  fixtureSecurity,
  type WorkerSecurityEnv,
} from './worker-security.js';
import { authorizeActor } from '@beauty/kernel/application/actor-authorization';
import {
  resolveWorkspace,
  type WorkspaceRole,
} from '../workspace-authority.js';
import type { UserRpcAuthority } from '@beauty/contracts';

/** Compatibility export for existing adapters; wire versions live in contracts. */
export type UserRpcAuthorityV1 = UserRpcAuthority;
export interface RpcPolicy {
  permissions?: readonly string[];
  eventType?: string;
}

export function dispatchConfiguration(env: WorkerSecurityEnv): {
  batchSize: number;
  leaseSeconds: number;
} {
  const batchSize = Number(env.OUTBOX_BATCH_SIZE);
  const leaseSeconds = Number(env.OUTBOX_LEASE_SECONDS);
  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    !Number.isSafeInteger(leaseSeconds) ||
    leaseSeconds < 1
  )
    throw new Error('VALIDATION_ERROR');
  if (!fixtureSecurity(env) && (batchSize !== 5 || leaseSeconds !== 60))
    throw new Error('VALIDATION_ERROR');
  return { batchSize, leaseSeconds };
}

export function authorizeSystemDispatch<
  T extends {
    workerId: string;
    batchSize: number;
    leaseSeconds: number;
    now?: string;
  },
>(env: WorkerSecurityEnv, caller: unknown, input: T): T {
  if (fixtureSecurity(env)) return input;
  workerSecurity(env);
  if (caller !== 'beauty-operations-worker')
    throw new Error('PERMISSION_DENIED');
  // Production limits and time come from the receiver, never the RPC payload.
  return {
    ...input,
    ...dispatchConfiguration(env),
    workerId: crypto.randomUUID(),
    now: undefined,
  };
}

export function userRpcMetadata(request: Request): {
  rpcAuthority: UserRpcAuthorityV1;
} {
  return {
    rpcAuthority: {
      version: 2,
      kind: 'user',
      selection: {
        tenantId:
          new URL(request.url).pathname.match(/^\/tenants\/([^/]+)/)?.[1] ??
          request.headers.get('x-tenant-id') ??
          '',
        role: (request.headers.get('x-workspace-role') ?? undefined) as
          WorkspaceRole | undefined,
        professionalId: request.headers.get('x-professional-id') ?? undefined,
      },
      token:
        request.headers
          .get('authorization')
          ?.match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? '',
    },
  };
}

/** Each composition gets its own binding wrappers; no request identity is kept globally. */
export function bindRpcAuthority<T extends object>(
  env: T,
  authority?: UserRpcAuthorityV1,
): T {
  if (!authority) return env;
  const scoped = { ...env };
  for (const key of Object.keys(scoped)) {
    if (!key.endsWith('_SERVICE')) continue;
    const binding = (env as Record<string, unknown>)[key];
    if (!binding || typeof binding !== 'object') continue;
    (scoped as Record<string, unknown>)[key] = new Proxy(binding, {
      get(target, property) {
        const method = Reflect.get(target, property);
        if (typeof method !== 'function') return method;
        if (property === 'fetch')
          return (...args: unknown[]) => Reflect.apply(method, target, args);
        return (input: Record<string, unknown>) =>
          Reflect.apply(method, target, [
            { ...input, rpcAuthority: authority },
          ]);
      },
    });
  }
  return scoped;
}

export async function authorizeWorkerRpc(
  env: WorkerSecurityEnv,
  policy: RpcPolicy,
  value: unknown,
  professionalForResource?: (
    input: Record<string, unknown>,
    professionalId: string,
  ) => Promise<string | null>,
): Promise<{ input: Record<string, unknown>; authority?: UserRpcAuthorityV1 }> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('VALIDATION_ERROR');
  const input = { ...value } as Record<string, unknown>;
  // Explicit fixture composition is the only exception. Production never takes this path.
  if (fixtureSecurity(env) && policy.eventType) {
    const authority = input.rpcAuthority as UserRpcAuthorityV1 | undefined;
    delete input.rpcAuthority;
    if (typeof input.actorId === 'string' && typeof input.tenantId === 'string')
      authorizeActor(input, {
        actorId: input.actorId,
        tenantId: input.tenantId,
      });
    return { input, authority };
  }
  if (typeof input.tenantId !== 'string' || !input.tenantId.trim())
    throw new Error('TENANT_ACCESS_DENIED');
  if (policy.eventType) {
    if (typeof input.eventId !== 'string' || !input.eventId.trim())
      throw new Error('PERMISSION_DENIED');
    const event = await env.D1_DATABASE.prepare(
      'SELECT payload_json,correlation_id FROM outbox_events WHERE tenant_id=? AND id=? AND event_type=?',
    )
      .bind(input.tenantId, input.eventId, policy.eventType)
      .first<{ payload_json: string; correlation_id: string }>();
    if (!event) throw new Error('PERMISSION_DENIED');
    const payload = JSON.parse(event.payload_json) as Record<string, unknown>;
    for (const [key, field] of Object.entries(input)) {
      if (
        ['rpcAuthority', 'eventId', 'correlationId', 'tenantId'].includes(key)
      )
        continue;
      if (JSON.stringify(field) !== JSON.stringify(payload[key]))
        throw new Error('PERMISSION_DENIED');
    }
    // Reconstruct from the committed event, never from caller-supplied financial or clinical facts.
    return {
      input: {
        ...payload,
        tenantId: input.tenantId,
        eventId: input.eventId,
        correlationId: event.correlation_id,
      },
    };
  }
  if (!policy.permissions?.length) throw new Error('PERMISSION_DENIED');
  const authority = input.rpcAuthority as
    Partial<UserRpcAuthorityV1> | undefined;
  if (
    !authority ||
    ![1, 2].includes(authority?.version ?? 0) ||
    authority.kind !== 'user' ||
    typeof authority.token !== 'string' ||
    (authority.version === 2 &&
      (!authority.selection ||
        typeof authority.selection.tenantId !== 'string'))
  )
    throw new Error('AUTHENTICATION_REQUIRED');
  const security = workerSecurity(env);
  const identity = await security.identity.authenticate(authority.token);
  if (!identity) throw new Error('INVALID_AUTHENTICATION');
  const candidate = await security.membership.findActiveMembership(
    identity.actorId,
    input.tenantId,
  );
  if (
    authority.version === 2 &&
    (!authority.selection || authority.selection.tenantId !== input.tenantId)
  )
    throw new Error('TENANT_ACCESS_DENIED');
  const membership = candidate
    ? resolveWorkspace(
        candidate,
        authority.version === 2 ? authority.selection : undefined,
      )
    : null;
  if (
    !membership ||
    !policy.permissions.some((permission) =>
      membership.permissions.includes(permission),
    )
  )
    throw new Error('PERMISSION_DENIED');
  input.actorId = identity.actorId;
  if (membership.professionalId) {
    const professional = professionalForResource
      ? await professionalForResource(input, membership.professionalId)
      : input.professionalId;
    if (professional !== membership.professionalId)
      throw new Error('PERMISSION_DENIED');
  }
  delete input.rpcAuthority;
  input.actorId = identity.actorId;
  authorizeActor(input, {
    actorId: identity.actorId,
    tenantId: input.tenantId,
    professionalId: membership.professionalId,
  });
  return { input, authority: authority as UserRpcAuthorityV1 };
}

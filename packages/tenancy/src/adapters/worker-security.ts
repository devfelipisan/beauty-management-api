import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type { IdentityProvider } from '@beauty/authentication/ports/identity-provider';
import { JwtIdentityProvider } from '@beauty/authentication/adapters/jwt-identity-provider';
import { MockIdentityProvider } from '@beauty/authentication/adapters/mock-identity-provider';
import type { TenantMembershipProvider } from '../ports/tenant-membership-provider.js';
import { MockTenantMembershipProvider } from './mock-tenant-membership-provider.js';
import { D1TenantMembershipProvider } from './d1-tenant-membership-provider.js';

export interface WorkerSecurityEnv {
  D1_DATABASE: D1DatabaseLike;
  APP_ENV?: string;
  AUTH_PROVIDER?: string;
  AUTH_ISSUER?: string;
  AUTH_AUDIENCE?: string;
  AUTH_JWKS_URL?: string;
  AUTH_ALGORITHM?: string;
  OUTBOX_BATCH_SIZE?: string;
  OUTBOX_LEASE_SECONDS?: string;
  SERVICE_VERSION?: string;
  OBSERVE_ENABLED?: string;
}

type Security = {
  identity: IdentityProvider;
  membership: TenantMembershipProvider;
};
const cache = new WeakMap<object, Security>();
declare const __BEAUTY_LOCAL__: boolean;
export function fixtureSecurity(env: WorkerSecurityEnv): boolean {
  return (
    (typeof __BEAUTY_LOCAL__ === 'undefined'
      ? process.env.NODE_ENV === 'test'
      : __BEAUTY_LOCAL__) &&
    env.AUTH_PROVIDER === 'mock' &&
    ['local', 'test'].includes(env.APP_ENV ?? '')
  );
}

export async function requireHttpAuthority(
  request: Request,
  env: WorkerSecurityEnv,
): Promise<void> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/tenants/') && !path.startsWith('/v1/me/')) return;
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) throw new Error('AUTHENTICATION_REQUIRED');
  const security = workerSecurity(env);
  const identity = await security.identity.authenticate(token);
  if (!identity) throw new Error('INVALID_AUTHENTICATION');
  const tenantId = path.startsWith('/tenants/')
    ? path.split('/')[2]
    : request.headers.get('x-tenant-id');
  if (
    tenantId &&
    !(await security.membership.findActiveMembership(
      identity.actorId,
      tenantId,
    ))
  )
    throw new Error('TENANT_ACCESS_DENIED');
}

export function workerSecurity(env: WorkerSecurityEnv): Security {
  const existing = cache.get(env);
  if (existing) return existing;
  let security: Security;
  if (fixtureSecurity(env)) {
    security = {
      identity: new MockIdentityProvider(),
      membership: new MockTenantMembershipProvider(),
    };
  } else if (
    env.AUTH_PROVIDER === 'jwt' &&
    env.AUTH_ISSUER &&
    env.AUTH_AUDIENCE &&
    env.AUTH_JWKS_URL &&
    env.AUTH_ALGORITHM
  ) {
    const directory = new D1TenantMembershipProvider(env.D1_DATABASE);
    security = {
      identity: new JwtIdentityProvider(
        {
          issuer: env.AUTH_ISSUER,
          audience: env.AUTH_AUDIENCE,
          jwksUrl: env.AUTH_JWKS_URL,
          algorithms: [env.AUTH_ALGORITHM],
        },
        directory,
      ),
      membership: directory,
    };
  } else {
    throw new Error('INVALID_AUTHENTICATION_CONFIGURATION');
  }
  cache.set(env, security);
  return security;
}

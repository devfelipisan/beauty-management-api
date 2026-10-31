import { JwtIdentityProvider } from '@beauty/authentication/adapters/jwt-identity-provider';
import { MockIdentityProvider } from '@beauty/authentication/adapters/mock-identity-provider';
import { D1TenantMembershipProvider } from './d1-tenant-membership-provider.js';
import {
  workerSecurity,
  requireHttpAuthority,
  type WorkerSecurityEnv,
} from './worker-security.js';

const remote = (): WorkerSecurityEnv => ({
  D1_DATABASE: {} as never,
  APP_ENV: 'production',
  AUTH_PROVIDER: 'jwt',
  AUTH_ISSUER: 'https://identity.test/auth/v1',
  AUTH_AUDIENCE: 'api',
  AUTH_JWKS_URL: 'https://identity.test/auth/v1/.well-known/jwks.json',
  AUTH_ALGORITHM: 'ES256',
});
describe('Worker security composition', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('does not permit Dashboard Text to enable fixture adapters in a production artifact', () => {
    vi.stubGlobal('__BEAUTY_LOCAL__', false);
    expect(() =>
      workerSecurity({
        D1_DATABASE: {} as never,
        APP_ENV: 'local',
        AUTH_PROVIDER: 'mock',
      }),
    ).toThrow('INVALID_AUTHENTICATION_CONFIGURATION');
  });
  it.each(['local', 'test'])(
    'uses explicit fixture adapters only in %s',
    (APP_ENV) => {
      const env = { D1_DATABASE: {} as never, AUTH_PROVIDER: 'mock', APP_ENV };
      expect(workerSecurity(env).identity).toBeInstanceOf(MockIdentityProvider);
      expect(workerSecurity(env)).toBe(workerSecurity(env));
      expect(workerSecurity({ ...env })).not.toBe(workerSecurity(env));
    },
  );
  it.each(['production', 'staging', 'development', undefined])(
    'fails closed for mock authentication in %s',
    (APP_ENV) => {
      expect(() =>
        workerSecurity({
          D1_DATABASE: {} as never,
          AUTH_PROVIDER: 'mock',
          APP_ENV,
        }),
      ).toThrow('INVALID_AUTHENTICATION_CONFIGURATION');
    },
  );
  it('constructs remote adapters without authenticating or caching membership data', () => {
    const security = workerSecurity(remote());
    expect(security.identity).toBeInstanceOf(JwtIdentityProvider);
    expect(security.membership).toBeInstanceOf(D1TenantMembershipProvider);
    for (const key of [
      'AUTH_PROVIDER',
      'AUTH_ISSUER',
      'AUTH_AUDIENCE',
      'AUTH_JWKS_URL',
      'AUTH_ALGORITHM',
    ] as const) {
      const env = remote();
      delete env[key];
      expect(() => workerSecurity(env)).toThrow(
        'INVALID_AUTHENTICATION_CONFIGURATION',
      );
    }
  });
  it('leaves public non-business paths alone, but requires bearer identity for business paths', async () => {
    await expect(
      requireHttpAuthority(new Request('https://api.test/health'), {} as never),
    ).resolves.toBeUndefined();
    for (const authorization of [
      undefined,
      'Basic token',
      'Bearer token extra',
    ]) {
      await expect(
        requireHttpAuthority(
          new Request('https://api.test/tenants/tenant/customers', {
            headers: authorization ? { authorization } : {},
          }),
          remote(),
        ),
      ).rejects.toThrow('AUTHENTICATION_REQUIRED');
    }
  });
  it('checks current membership for path and header selectors and distinguishes invalid identity', async () => {
    const identity = vi
      .spyOn(JwtIdentityProvider.prototype, 'authenticate')
      .mockResolvedValue({ actorId: 'actor', subject: 'subject' });
    const membership = vi
      .spyOn(D1TenantMembershipProvider.prototype, 'findActiveMembership')
      .mockResolvedValue({
        tenantId: 'tenant',
        actorId: 'actor',
        active: true,
        roles: [],
        permissions: [],
      });
    const env = remote();
    const headers = { authorization: 'Bearer signed-token' };
    await requireHttpAuthority(
      new Request('https://api.test/tenants/tenant/customers', { headers }),
      env,
    );
    expect(membership).toHaveBeenLastCalledWith('actor', 'tenant');
    await requireHttpAuthority(
      new Request('https://api.test/v1/me/context', {
        headers: { ...headers, 'x-tenant-id': 'other' },
      }),
      env,
    );
    expect(membership).toHaveBeenLastCalledWith('actor', 'other');
    membership.mockClear();
    await requireHttpAuthority(
      new Request('https://api.test/v1/me/tenants', { headers }),
      env,
    );
    expect(membership).not.toHaveBeenCalled();
    membership.mockResolvedValue(null);
    await expect(
      requireHttpAuthority(
        new Request('https://api.test/tenants/tenant/customers', { headers }),
        env,
      ),
    ).rejects.toThrow('TENANT_ACCESS_DENIED');
    identity.mockResolvedValue(null);
    await expect(
      requireHttpAuthority(
        new Request('https://api.test/v1/me/tenants', { headers }),
        env,
      ),
    ).rejects.toThrow('INVALID_AUTHENTICATION');
  });
});

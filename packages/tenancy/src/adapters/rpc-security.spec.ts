import { JwtIdentityProvider } from '@beauty/authentication/adapters/jwt-identity-provider';
import { assertProfessionalAuthorization } from '@beauty/kernel/application/actor-authorization';
import {
  authorizeWorkerRpc,
  authorizeSystemDispatch,
  bindRpcAuthority,
} from './rpc-security.js';

describe('RPC authority', () => {
  afterEach(() => vi.restoreAllMocks());

  function environment() {
    let permissions = ['session.complete'];
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ id: 'internal-actor' }),
          all: async () => ({
            results: permissions.map((permission_code) => ({
              professional_id: 'professional-1',
              role_name: 'professional',
              permission_code,
            })),
          }),
        }),
      }),
    };
    return {
      env: {
        D1_DATABASE: db as never,
        APP_ENV: 'production',
        AUTH_PROVIDER: 'jwt',
        AUTH_ISSUER: 'https://identity.test/auth/v1',
        AUTH_AUDIENCE: 'api',
        AUTH_JWKS_URL: 'https://identity.test/auth/v1/.well-known/jwks.json',
        AUTH_ALGORITHM: 'ES256',
      },
      revoke: () => {
        permissions = [];
      },
    };
  }

  it('derives actor and checks current grants and resource scope before attaching application authority', async () => {
    const { env, revoke } = environment();
    // Signature/claim verification is separately exercised with real keys in JwtIdentityProvider tests.
    vi.spyOn(JwtIdentityProvider.prototype, 'authenticate').mockResolvedValue({
      actorId: 'internal-actor',
      subject: 'external-subject',
    });
    const rpcAuthority = { version: 1, kind: 'user', token: 'test-credential' };
    const input = {
      tenantId: 'tenant',
      sessionId: 'session',
      actorId: 'forged-admin',
      rpcAuthority,
    };
    const result = await authorizeWorkerRpc(
      env,
      { permissions: ['session.complete'] },
      input,
      async () => 'professional-1',
    );
    expect(result.input.actorId).toBe('internal-actor');
    expect(JSON.stringify(result.input)).not.toContain('test-credential');
    expect(() =>
      assertProfessionalAuthorization(result.input as never, 'professional-1'),
    ).not.toThrow();
    expect(() =>
      assertProfessionalAuthorization(result.input as never, 'professional-2'),
    ).toThrow('PERMISSION_DENIED');
    expect(() =>
      assertProfessionalAuthorization(
        JSON.parse(JSON.stringify(result.input)),
        'professional-1',
      ),
    ).toThrow('PERMISSION_DENIED');
    await expect(
      authorizeWorkerRpc(
        env,
        { permissions: ['session.complete'] },
        input,
        async () => 'professional-2',
      ),
    ).rejects.toThrow('PERMISSION_DENIED');
    revoke();
    await expect(
      authorizeWorkerRpc(
        env,
        { permissions: ['session.complete'] },
        input,
        async () => 'professional-1',
      ),
    ).rejects.toThrow('PERMISSION_DENIED');
  });

  it('denies undefined policies and maintenance calls without the trusted coordinator', async () => {
    const { env } = environment();
    await expect(
      authorizeWorkerRpc(env, {}, { tenantId: 'tenant' }),
    ).rejects.toThrow('PERMISSION_DENIED');
    await expect(
      authorizeWorkerRpc(
        env,
        { permissions: ['session.complete'] },
        { tenantId: 'tenant' },
      ),
    ).rejects.toThrow('AUTHENTICATION_REQUIRED');
    expect(() =>
      authorizeSystemDispatch(env, 'browser', {
        workerId: 'fake',
        batchSize: 1,
        leaseSeconds: 1,
      }),
    ).toThrow('PERMISSION_DENIED');
  });

  it('forwards authority per binding invocation without mutating a shared environment', async () => {
    const call = vi.fn(async (input: unknown) => input);
    const env = { BILLING_SERVICE: { operation: call } };
    const first = bindRpcAuthority(env, {
      version: 1,
      kind: 'user',
      token: 'first',
    });
    const second = bindRpcAuthority(env, {
      version: 1,
      kind: 'user',
      token: 'second',
    });
    await Promise.all([
      first.BILLING_SERVICE.operation({ tenantId: 'a' }),
      second.BILLING_SERVICE.operation({ tenantId: 'b' }),
    ]);
    expect(call.mock.calls).toEqual([
      [
        {
          tenantId: 'a',
          rpcAuthority: { version: 1, kind: 'user', token: 'first' },
        },
      ],
      [
        {
          tenantId: 'b',
          rpcAuthority: { version: 1, kind: 'user', token: 'second' },
        },
      ],
    ]);
    expect(env.BILLING_SERVICE.operation).toBe(call);
  });
});

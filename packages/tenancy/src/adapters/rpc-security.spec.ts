import { JwtIdentityProvider } from '@beauty/authentication/adapters/jwt-identity-provider';
import { assertProfessionalAuthorization } from '@beauty/kernel/application/actor-authorization';
import {
  authorizeWorkerRpc,
  authorizeSystemDispatch,
  bindRpcAuthority,
  dispatchConfiguration,
  userRpcMetadata,
} from './rpc-security.js';

describe('RPC authority', () => {
  it('denies an empty reconciliation policy even with upload permission and does no persistence I/O',async()=>{
    const {env}=environment();
    const authenticate=vi.spyOn(JwtIdentityProvider.prototype,'authenticate');
    await expect(authorizeWorkerRpc(env,{}, {tenantId:'tenant',rpcAuthority:{version:1,kind:'user',token:'signed'}})).rejects.toThrow('PERMISSION_DENIED');
    expect(authenticate).not.toHaveBeenCalled();
  });
  it('rejects an unspecified fixture environment for both user and system operations', async () => {
    const env = { AUTH_PROVIDER: 'mock', D1_DATABASE: {} as never };
    await expect(
      authorizeWorkerRpc(env, {}, { tenantId: 'tenant' }),
    ).rejects.toThrow('PERMISSION_DENIED');
    expect(() =>
      authorizeSystemDispatch(env, 'beauty-operations-worker', {
        workerId: 'worker',
        batchSize: 1,
        leaseSeconds: 1,
      }),
    ).toThrow('INVALID_AUTHENTICATION_CONFIGURATION');
  });
  it('authorizes a current non-professional membership without requiring a professional selector', async () => {
    const { env } = environment();
    vi.spyOn(JwtIdentityProvider.prototype, 'authenticate').mockResolvedValue({
      actorId: 'actor',
      subject: 'subject',
    });
    const { D1TenantMembershipProvider } =
      await import('./d1-tenant-membership-provider.js');
    vi.spyOn(
      D1TenantMembershipProvider.prototype,
      'findActiveMembership',
    ).mockResolvedValue({
      actorId: 'actor',
      tenantId: 'tenant',
      active: true,
      roles: ['reception'],
      permissions: ['session.complete'],
    });
    const result = await authorizeWorkerRpc(
      env,
      { permissions: ['session.complete'] },
      {
        tenantId: 'tenant',
        rpcAuthority: { version: 1, kind: 'user', token: 'signed' },
      },
    );
    expect(result.input.actorId).toBe('actor');
    expect(() =>
      assertProfessionalAuthorization(
        result.input as never,
        'any-professional',
      ),
    ).not.toThrow();
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([null, [], 'command', 1])(
    'rejects a non-object input %j before using any adapter',
    async (input) => {
      await expect(authorizeWorkerRpc({} as never, {}, input)).rejects.toThrow(
        'VALIDATION_ERROR',
      );
    },
  );

  it('requires tenant identity and validates the user authority envelope without coercion', async () => {
    const { env } = environment();
    for (const tenantId of [undefined, '', ' ', 1])
      await expect(authorizeWorkerRpc(env, {}, { tenantId })).rejects.toThrow(
        'TENANT_ACCESS_DENIED',
      );
    for (const rpcAuthority of [
      { version: 2, kind: 'user', token: 't' },
      { version: 1, kind: 'system', token: 't' },
      { version: 1, kind: 'user', token: 1 },
    ]) {
      await expect(
        authorizeWorkerRpc(
          env,
          { permissions: ['session.complete'] },
          { tenantId: 'tenant', rpcAuthority },
        ),
      ).rejects.toThrow('AUTHENTICATION_REQUIRED');
    }
    vi.spyOn(JwtIdentityProvider.prototype, 'authenticate').mockResolvedValue(
      null,
    );
    await expect(
      authorizeWorkerRpc(
        env,
        { permissions: ['session.complete'] },
        {
          tenantId: 'tenant',
          rpcAuthority: { version: 1, kind: 'user', token: 'invalid' },
        },
      ),
    ).rejects.toThrow('INVALID_AUTHENTICATION');
  });

  it('reconstructs system facts from the committed tenant event and rejects altered/uncommitted payloads', async () => {
    const first = vi.fn().mockResolvedValue({
      payload_json: JSON.stringify({
        amountCents: 100,
        aggregateId: 'resource',
      }),
      correlation_id: 'stored-correlation',
    });
    const bind = vi.fn(() => ({ first }));
    const env = { D1_DATABASE: { prepare: vi.fn(() => ({ bind })) } } as never;
    const policy = { eventType: 'FinancialSettlementRequested' };
    const input = {
      tenantId: 'tenant',
      eventId: 'event',
      amountCents: 100,
      correlationId: 'untrusted',
      rpcAuthority: { kind: 'system' },
    };
    expect(await authorizeWorkerRpc(env, policy, input)).toEqual({
      input: {
        tenantId: 'tenant',
        eventId: 'event',
        amountCents: 100,
        aggregateId: 'resource',
        correlationId: 'stored-correlation',
      },
    });
    expect(bind).toHaveBeenCalledWith(
      'tenant',
      'event',
      'FinancialSettlementRequested',
    );
    await expect(
      authorizeWorkerRpc(env, policy, { ...input, amountCents: 999 }),
    ).rejects.toThrow('PERMISSION_DENIED');
    await expect(
      authorizeWorkerRpc(env, policy, { ...input, actorId: 'forged' }),
    ).rejects.toThrow('PERMISSION_DENIED');
    first.mockResolvedValue(null);
    await expect(authorizeWorkerRpc(env, policy, input)).rejects.toThrow(
      'PERMISSION_DENIED',
    );
    for (const eventId of [undefined, '', 1])
      await expect(
        authorizeWorkerRpc(env, policy, { tenantId: 'tenant', eventId }),
      ).rejects.toThrow('PERMISSION_DENIED');
  });

  it('supports explicitly selected fixture authority without leaking its transport envelope', async () => {
    const env = {
      APP_ENV: 'test',
      AUTH_PROVIDER: 'mock',
      D1_DATABASE: {} as never,
    };
    const rpcAuthority = {
      version: 1 as const,
      kind: 'user' as const,
      token: 'fixture',
    };
    const result = await authorizeWorkerRpc(
      env,
      {},
      { tenantId: 'tenant', actorId: 'actor', rpcAuthority },
    );
    expect(result.authority).toBe(rpcAuthority);
    expect(result.input).toEqual({ tenantId: 'tenant', actorId: 'actor' });
    expect(() =>
      assertProfessionalAuthorization(
        result.input as never,
        'any-professional',
      ),
    ).not.toThrow();
    expect((await authorizeWorkerRpc(env, {}, { value: 1 })).input).toEqual({
      value: 1,
    });
  });

  it('requires measured positive integer dispatch settings and takes production limits/time from the receiver', () => {
    const { env } = environment();
    const configured = {
      ...env,
      OUTBOX_BATCH_SIZE: '5',
      OUTBOX_LEASE_SECONDS: '60',
    };
    expect(dispatchConfiguration(configured)).toEqual({
      batchSize: 5,
      leaseSeconds: 60,
    });
    for (const invalid of [
      undefined,
      '0',
      '-1',
      '1.5',
      'NaN',
      'Infinity',
      '999',
    ]) {
      expect(() =>
        dispatchConfiguration({ ...configured, OUTBOX_BATCH_SIZE: invalid }),
      ).toThrow('VALIDATION_ERROR');
      expect(() =>
        dispatchConfiguration({ ...configured, OUTBOX_LEASE_SECONDS: invalid }),
      ).toThrow('VALIDATION_ERROR');
    }
    const input = {
      workerId: 'forged-worker',
      batchSize: 999,
      leaseSeconds: 999,
      now: 'forged-time',
    };
    const result = authorizeSystemDispatch(
      configured,
      'beauty-operations-worker',
      input,
    );
    expect(result).toMatchObject({
      batchSize: 5,
      leaseSeconds: 60,
      now: undefined,
    });
    expect(result.workerId).not.toBe(input.workerId);
    expect(
      authorizeSystemDispatch(
        { D1_DATABASE: {} as never, APP_ENV: 'test', AUTH_PROVIDER: 'mock' },
        undefined,
        input,
      ),
    ).toBe(input);
  });

  it('uses a matching professional selector only when no resource resolver exists, and rejects missing membership', async () => {
    const { env, revoke } = environment();
    vi.spyOn(JwtIdentityProvider.prototype, 'authenticate').mockResolvedValue({
      actorId: 'actor',
      subject: 'subject',
    });
    const input = {
      tenantId: 'tenant',
      professionalId: 'professional-1',
      rpcAuthority: { version: 1, kind: 'user', token: 'signed' },
    };
    expect(
      (
        await authorizeWorkerRpc(
          env,
          { permissions: ['session.complete'] },
          input,
        )
      ).input.actorId,
    ).toBe('actor');
    await expect(
      authorizeWorkerRpc(
        env,
        { permissions: ['session.complete'] },
        { ...input, professionalId: 'other' },
      ),
    ).rejects.toThrow('PERMISSION_DENIED');
    revoke();
    await expect(
      authorizeWorkerRpc(env, { permissions: ['session.complete'] }, input),
    ).rejects.toThrow('PERMISSION_DENIED');
  });

  it('extracts only bearer credentials and leaves absent bindings/authority untouched', async () => {
    expect(
      userRpcMetadata(
        new Request('https://api.test', {
          headers: { authorization: 'Bearer signed' },
        }),
      ),
    ).toEqual({ rpcAuthority: { version: 1, kind: 'user', token: 'signed' } });
    expect(
      userRpcMetadata(new Request('https://api.test')).rpcAuthority.token,
    ).toBe('');
    const fetch = vi.fn(function (this: unknown, request: Request) {
      return Promise.resolve(request);
    });
    const binding = { fetch, constant: 'value' };
    const env = {
      SOMETHING_SERVICE: null,
      OTHER_SERVICE: 'string',
      BILLING_SERVICE: binding,
      other: 'value',
    };
    expect(bindRpcAuthority(env)).toBe(env);
    const wrapped = bindRpcAuthority(env, {
      version: 1,
      kind: 'user',
      token: 'signed',
    });
    expect(wrapped.BILLING_SERVICE.constant).toBe('value');
    const request = new Request('https://api.test');
    expect(await wrapped.BILLING_SERVICE.fetch(request)).toBe(request);
    expect(fetch.mock.contexts[0]).toBe(binding);
  });

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

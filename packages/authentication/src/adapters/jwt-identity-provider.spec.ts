import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { JwtIdentityProvider } from './jwt-identity-provider.js';

describe('JwtIdentityProvider', () => {
  it('rejects missing claims, absent key ID and future issue time before consulting the directory', async () => {
    const keys = await generateKeyPair('ES256');
    const jwk = {
      ...(await exportJWK(keys.publicKey)),
      kid: 'key',
      alg: 'ES256',
    };
    const directory = { findIdentity: vi.fn().mockResolvedValue(null) };
    const provider = new JwtIdentityProvider(
      {
        issuer: 'https://identity.test',
        audience: 'api',
        jwksUrl: 'https://identity.test/keys',
        algorithms: ['ES256'],
      },
      directory,
      createLocalJWKSet({ keys: [jwk] }),
    );
    const payload = {
      sub: 'subject',
      iss: 'https://identity.test',
      aud: 'api',
      exp: Math.floor(Date.now() / 1000) + 300,
    };
    for (const claim of ['sub', 'iss', 'aud', 'exp'] as const) {
      const missing: Record<string, unknown> = { ...payload };
      delete missing[claim];
      const token = await new SignJWT(missing)
        .setProtectedHeader({ alg: 'ES256', kid: 'key' })
        .sign(keys.privateKey);
      expect(await provider.authenticate(token)).toBeNull();
    }
    for (const invalid of [
      { ...payload, sub: ' ' },
      { ...payload, iat: Math.floor(Date.now() / 1000) + 3600 },
      { ...payload, nbf: Math.floor(Date.now() / 1000) + 3600 },
    ]) {
      const token = await new SignJWT(invalid)
        .setProtectedHeader({ alg: 'ES256', kid: 'key' })
        .sign(keys.privateKey);
      expect(await provider.authenticate(token)).toBeNull();
    }
    const noKid = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256' })
      .sign(keys.privateKey);
    expect(await provider.authenticate(noKid)).toBeNull();
    expect(directory.findIdentity).not.toHaveBeenCalled();
    const valid = await new SignJWT({
      ...payload,
      iat: Math.floor(Date.now() / 1000) - 1,
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'key' })
      .sign(keys.privateKey);
    expect(await provider.authenticate(valid)).toBeNull();
    expect(directory.findIdentity).toHaveBeenCalledWith(
      'https://identity.test',
      'subject',
    );
    const failure = new Error('DIRECTORY_UNAVAILABLE');
    directory.findIdentity.mockRejectedValue(failure);
    await expect(provider.authenticate(valid)).rejects.toBe(failure);
  });

  it.each([
    { issuer: '' },
    { audience: '' },
    { algorithms: [] },
    { issuer: 'http://identity.test' },
    { jwksUrl: 'http://identity.test/keys' },
    { jwksUrl: 'https://other.test/keys' },
    { issuer: 'https://user@identity.test' },
    { issuer: 'https://:password@identity.test' },
    { jwksUrl: 'https://user@identity.test/keys' },
    { jwksUrl: 'https://:password@identity.test/keys' },
  ])('fails closed for unsafe issuer/key configuration %j', (patch) => {
    expect(
      () =>
        new JwtIdentityProvider(
          {
            issuer: 'https://identity.test',
            audience: 'api',
            jwksUrl: 'https://identity.test/keys',
            algorithms: ['ES256'],
            ...patch,
          },
          { findIdentity: async () => null },
        ),
    ).toThrow('INVALID_AUTHENTICATION_CONFIGURATION');
  });
  it('verifies signature and claims before resolving an internal actor', async () => {
    const keys = await generateKeyPair('ES256');
    const jwk = {
      ...(await exportJWK(keys.publicKey)),
      kid: 'key-1',
      alg: 'ES256',
      use: 'sig',
    };
    const directory = {
      findIdentity: vi.fn(async () => ({
        actorId: 'internal-actor',
        subject: 'external-subject',
      })),
    };
    const provider = new JwtIdentityProvider(
      {
        issuer: 'https://identity.test/auth/v1',
        audience: 'api',
        jwksUrl: 'https://identity.test/auth/v1/.well-known/jwks.json',
        algorithms: ['ES256'],
      },
      directory,
      createLocalJWKSet({ keys: [jwk] }),
    );
    const token = (
      issuer = 'https://identity.test/auth/v1',
      audience = 'api',
      expiration: number | string = '5m',
    ) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
        .setSubject('external-subject')
        .setIssuer(issuer)
        .setAudience(audience)
        .setExpirationTime(expiration)
        .sign(keys.privateKey);
    expect(await provider.authenticate(await token())).toEqual({
      actorId: 'internal-actor',
      subject: 'external-subject',
    });
    directory.findIdentity.mockClear();
    for (const invalid of [
      'actor-dev-admin',
      await token('https://other.test'),
      await token(undefined, 'other'),
      await token(undefined, undefined, 1),
    ]) {
      expect(await provider.authenticate(invalid)).toBeNull();
    }
    const other = await generateKeyPair('ES256');
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
      .setSubject('external-subject')
      .setIssuer('https://identity.test/auth/v1')
      .setAudience('api')
      .setExpirationTime('5m')
      .sign(other.privateKey);
    expect(await provider.authenticate(forged)).toBeNull();
    expect(directory.findIdentity).not.toHaveBeenCalled();
  });

  it('rejects symmetric algorithms and insecure configuration', () => {
    expect(
      () =>
        new JwtIdentityProvider(
          {
            issuer: 'https://identity.test',
            audience: 'api',
            jwksUrl: 'https://identity.test/keys',
            algorithms: ['HS256'],
          },
          { findIdentity: async () => null },
        ),
    ).toThrow('INVALID_AUTHENTICATION_CONFIGURATION');
  });
});

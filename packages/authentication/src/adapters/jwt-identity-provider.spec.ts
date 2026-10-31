import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { JwtIdentityProvider } from './jwt-identity-provider.js';

describe('JwtIdentityProvider', () => {
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

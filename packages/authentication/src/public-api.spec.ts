import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AuthenticationModule,
  AuthenticationGuard,
  IDENTITY_PROVIDER,
  RequirePermission,
} from '@beauty/authentication';
import { MockIdentityProvider } from '@beauty/authentication/adapters/mock-identity-provider';
import { JwtIdentityProvider } from '@beauty/authentication/adapters/jwt-identity-provider';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { RequirePermission as SourceRequirePermission } from './decorators/require-permission.decorator.js';

describe('authentication package public exports', () => {
  it('resolves the configured fixture provider through the public Nest module', async () => {
    const module = await Test.createTestingModule({
      imports: [AuthenticationModule],
    })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ APP_ENV: 'test', AUTH_PROVIDER: 'mock' }))
      .compile();
    try {
      const provider = module.get<MockIdentityProvider>(IDENTITY_PROVIDER);
      expect(await provider.authenticate('actor-example')).toEqual({
        actorId: 'actor-example',
        subject: 'actor-example',
      });
      expect(await provider.authenticate('invalid')).toBeNull();
      const request = { header: () => 'Bearer actor-example' };
      const guard = new AuthenticationGuard(provider);
      expect(
        await guard.canActivate({
          switchToHttp: () => ({ getRequest: () => request }),
        } as never),
      ).toBe(true);
      expect(request).toMatchObject({ user: { actorId: 'actor-example' } });
    } finally {
      await module.close();
    }
  });
  it('exports a permission decorator whose metadata can be consumed by the Nest reflector', () => {
    class Handler {}
    RequirePermission('customer.read')(Handler);
    expect(
      new Reflector().get('authentication:required-permissions', Handler),
    ).toEqual(['customer.read']);
    class SourceHandler {}
    SourceRequirePermission('customer.read')(SourceHandler);
    expect(
      new Reflector().get('authentication:required-permissions', SourceHandler),
    ).toEqual(['customer.read']);
  });
  it('verifies signed credentials using the exported JWT adapter before mapping identity', async () => {
    const keys = await generateKeyPair('ES256');
    const jwk = {
      ...(await exportJWK(keys.publicKey)),
      kid: 'key',
      alg: 'ES256',
    };
    const directory = {
      findIdentity: vi
        .fn()
        .mockResolvedValue({ actorId: 'actor', subject: 'subject' }),
    };
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
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'key' })
      .setIssuer('https://identity.test')
      .setAudience('api')
      .setSubject('subject')
      .setExpirationTime('5m')
      .sign(keys.privateKey);
    expect(await provider.authenticate(token)).toEqual({
      actorId: 'actor',
      subject: 'subject',
    });
    expect(directory.findIdentity).toHaveBeenCalledWith(
      'https://identity.test',
      'subject',
    );
    expect(await provider.authenticate('forged')).toBeNull();
  });
});

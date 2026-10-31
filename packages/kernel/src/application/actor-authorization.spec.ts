import {
  authorizeActor,
  inheritActorAuthorization,
  assertProfessionalAuthorization,
} from './actor-authorization.js';

describe('verified actor scope', () => {
  const scope = {
    tenantId: 'tenant',
    actorId: 'actor',
    professionalId: 'professional',
  };
  it('keeps scope private across JSON/spread and explicitly inherits it for trusted composition', () => {
    const command = authorizeActor(
      { tenantId: 'tenant', actorId: 'actor' },
      scope,
    );
    expect(() =>
      assertProfessionalAuthorization(command, 'professional'),
    ).not.toThrow();
    for (const copy of [{ ...command }, JSON.parse(JSON.stringify(command))]) {
      expect(() =>
        assertProfessionalAuthorization(copy, 'professional'),
      ).toThrow('PERMISSION_DENIED');
    }
    const child = inheritActorAuthorization(command, { ...command });
    expect(() =>
      assertProfessionalAuthorization(child, 'professional'),
    ).not.toThrow();
    const untrusted = { tenantId: 'tenant', actorId: 'actor' };
    expect(inheritActorAuthorization({}, untrusted)).toBe(untrusted);
    expect(() =>
      assertProfessionalAuthorization(untrusted, 'professional'),
    ).toThrow('PERMISSION_DENIED');
  });
  it.each([
    { tenantId: 'other', actorId: 'actor' },
    { tenantId: 'tenant', actorId: 'other' },
  ])(
    'rejects commands whose identity no longer matches their scope: %j',
    (command) => {
      authorizeActor(command, scope);
      expect(() =>
        assertProfessionalAuthorization(command, 'professional'),
      ).toThrow('PERMISSION_DENIED');
    },
  );
  it('copies the source scope and allows unscoped members across professionals', () => {
    const source = { ...scope };
    const command = authorizeActor(
      { tenantId: 'tenant', actorId: 'actor' },
      source,
    );
    source.professionalId = 'other';
    expect(() =>
      assertProfessionalAuthorization(command, 'professional'),
    ).not.toThrow();
    expect(() => assertProfessionalAuthorization(command, 'other')).toThrow(
      'PERMISSION_DENIED',
    );
    const unrestricted = authorizeActor(
      { tenantId: 'tenant', actorId: 'actor' },
      { tenantId: 'tenant', actorId: 'actor' },
    );
    expect(() =>
      assertProfessionalAuthorization(unrestricted, 'other'),
    ).not.toThrow();
  });
});

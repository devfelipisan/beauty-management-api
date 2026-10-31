import { Session } from './session.js';

const references = {
  tenantId: 'tenant',
  appointmentId: 'appointment',
  customerId: 'customer',
  serviceId: 'service',
  professionalId: 'professional',
  startedAt: 'started',
  startedBy: 'actor',
};
describe('Session lifecycle', () => {
  it('starts in progress and completes as a new aggregate preserving the original', () => {
    const session = Session.start('session', references, 'created');
    expect(session.data).toMatchObject({
      ...references,
      status: 'IN_PROGRESS',
      createdAt: 'created',
      updatedAt: 'created',
    });
    const completed = session.complete('executor', 'finished');
    expect(completed.id).toBe(session.id);
    expect(completed.data).toMatchObject({
      status: 'COMPLETED',
      completedBy: 'executor',
      completedAt: 'finished',
      updatedAt: 'finished',
    });
    expect(session.data.status).toBe('IN_PROGRESS');
    expect(() => completed.complete('executor', 'later')).toThrow(
      'Session is not in progress',
    );
  });
  it.each([
    'tenantId',
    'appointmentId',
    'customerId',
    'serviceId',
    'professionalId',
    'startedBy',
  ])('requires %s when starting', (key) => {
    expect(() =>
      Session.start('session', { ...references, [key]: '' }),
    ).toThrow('Session references and executor are required');
  });
  it.each([
    ['', 'finished'],
    ['actor', ''],
  ])('requires actor/time to complete (%s, %s)', (actor, at) => {
    expect(() =>
      Session.start('session', references).complete(actor, at),
    ).toThrow('Completion actor and time are required');
  });
  it('preserves restored timestamps and exposes a shallow defensive copy', () => {
    const session = Session.start('session', {
      ...references,
      createdAt: 'original',
      updatedAt: 'updated',
    });
    const restored = Session.restore(session.id, session.data);
    expect(restored.data).toEqual(session.data);
    const copy = restored.data;
    (copy as { status: string }).status = 'COMPLETED';
    expect(restored.data.status).toBe('IN_PROGRESS');
  });
});

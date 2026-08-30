import { StartSession } from './start-session.js';

describe('StartSession', () => {
  it('blocks an appointment that is not checked in before creating a session', async () => {
    const context = { getSessionStartContext: async () => ({ status: 'BLOCKED' as const, reason: 'APPOINTMENT_NOT_CHECKED_IN' }) };
    const sessions = { findByAppointment: async () => null };
    const uow = { execute: async () => { throw new Error('must not persist'); } };
    const store = { find: async () => null, reserve: async () => undefined, complete: async () => undefined, fail: async () => undefined };
    await expect(new StartSession(sessions as never, context, uow as never, store as never).execute({ tenantId:'t', appointmentId:'a', actorId:'actor', idempotencyKey:'k', requestId:'r', correlationId:'c' })).rejects.toMatchObject({ code:'APPOINTMENT_NOT_CHECKED_IN' });
  });
});

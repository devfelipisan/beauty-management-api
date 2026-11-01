import { StartSession } from './start-session.js';
import { IdempotencyService } from '@beauty/reliability/idempotency/idempotency.service';
import type { IdempotencyStore } from '@beauty/reliability/idempotency/idempotency-store';

function fixture() {
  const input = {
    tenantId: 'tenant',
    appointmentId: 'appointment',
    actorId: 'actor',
    idempotencyKey: 'key',
    requestId: 'request',
    correlationId: 'correlation',
  };
  const sessions = {
    findByAppointment: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  };
  const qualification = {
    status: 'READY',
    appointmentId: 'appointment',
    customerId: 'customer',
    serviceId: 'service',
    professionalId: 'professional',
    customerPackageId: 'package',
    completionRequirements: { requiresPhotography: true },
  };
  const context = {
    getSessionStartContext: vi.fn().mockResolvedValue(qualification),
  };
  const store = {
    find: vi.fn().mockResolvedValue(null),
    reserve: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };
  const tx = {
    persistence: { add: vi.fn() },
    audit: { append: vi.fn() },
    outbox: { append: vi.fn() },
    idempotency: { reserve: vi.fn(), complete: vi.fn(), fail: vi.fn() },
  };
  const uow = {
    execute: vi.fn(async (operation: (context: typeof tx) => unknown) =>
      operation(tx),
    ),
  };
  const start = new StartSession(
    sessions as never,
    context,
    uow as never,
    store,
  );
  return { input, sessions, qualification, context, store, tx, uow, start };
}
describe('StartSession orchestration', () => {
  it('blocks a new session requiring unavailable photography before any write', async () => {
    const f = fixture();
    const start = new StartSession(
      f.sessions as never,
      f.context,
      f.uow as never,
      f.store,
      undefined,
      false,
    );
    await expect(start.execute(f.input)).rejects.toMatchObject({
      code: 'CLINICAL_MEDIA_UNAVAILABLE',
    });
    expect(f.uow.execute).not.toHaveBeenCalled();
    expect(f.sessions.create).not.toHaveBeenCalled();
  });
  it('allows a previously completed idempotent replay without creating a session', async () => {
    const f = fixture();
    const response = { id: 'existing' };
    f.store.find.mockResolvedValue({ status: 'COMPLETED', response });
    const start = new StartSession(
      f.sessions as never,
      f.context,
      f.uow as never,
      f.store,
      undefined,
      false,
    );
    await expect(start.execute(f.input)).resolves.toBe(response);
    expect(f.uow.execute).not.toHaveBeenCalled();
  });
  it('exposes transaction-bound complete/fail operations through the injected idempotency store', async () => {
    const f = fixture();
    let delegated: IdempotencyStore | undefined;
    const original = IdempotencyService.prototype.reserveOrReplay;
    const spy = vi
      .spyOn(IdempotencyService.prototype, 'reserveOrReplay')
      .mockImplementationOnce(function (store, ...args) {
        delegated = store;
        return original.call(this, store, ...args);
      });
    try {
      await f.start.execute(f.input);
      await delegated!.complete('tenant', 'START_SESSION', 'key', {
        id: 'response',
      });
      await delegated!.fail('tenant', 'START_SESSION', 'key');
      expect(f.tx.idempotency.complete).toHaveBeenCalledWith(
        'tenant',
        'START_SESSION',
        'key',
        { id: 'response' },
      );
      expect(f.tx.idempotency.fail).toHaveBeenCalledWith(
        'tenant',
        'START_SESSION',
        'key',
      );
      expect(f.store.complete).not.toHaveBeenCalled();
      expect(f.store.fail).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it('persists a qualified session with audit, outbox and idempotent response in the same transaction', async () => {
    const f = fixture();
    const response = await f.start.execute(f.input);
    expect(response).toMatchObject({
      tenantId: 'tenant',
      appointmentId: 'appointment',
      customerId: 'customer',
      serviceId: 'service',
      professionalId: 'professional',
      status: 'IN_PROGRESS',
      startedBy: 'actor',
    });
    expect(f.context.getSessionStartContext).toHaveBeenCalledWith({
      tenantId: 'tenant',
      appointmentId: 'appointment',
      actorId: 'actor',
      correlationId: 'correlation',
    });
    const session = f.sessions.create.mock.calls[0][0];
    expect(session.data).toMatchObject({
      customerPackageId: 'package',
      completionRequirements: { requiresPhotography: true },
    });
    expect(f.sessions.create).toHaveBeenCalledWith(session, f.tx.persistence);
    expect(f.tx.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'session.started',
        resourceId: response.id,
        actorId: 'actor',
      }),
    );
    expect(f.tx.outbox.append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SessionStarted',
        tenantId: 'tenant',
        payload: expect.objectContaining({
          sessionId: response.id,
          customerPackageId: 'package',
        }),
      }),
    );
    expect(f.tx.idempotency.complete).toHaveBeenCalledWith(
      'tenant',
      'START_SESSION',
      'key',
      response,
    );
    expect(f.store.complete).not.toHaveBeenCalled();
  });
  it('returns completed replay before inspecting current session or qualification', async () => {
    const f = fixture();
    const response = { id: 'original' };
    f.store.find.mockResolvedValue({ status: 'COMPLETED', response });
    expect(await f.start.execute(f.input)).toBe(response);
    expect(f.sessions.findByAppointment).not.toHaveBeenCalled();
    expect(f.context.getSessionStartContext).not.toHaveBeenCalled();
    expect(f.uow.execute).not.toHaveBeenCalled();
  });
  it('rejects an already-started appointment before qualification or writes', async () => {
    const f = fixture();
    f.sessions.findByAppointment.mockResolvedValue({ id: 'existing' });
    await expect(f.start.execute(f.input)).rejects.toMatchObject({
      code: 'SESSION_ALREADY_STARTED',
    });
    expect(f.context.getSessionStartContext).not.toHaveBeenCalled();
    expect(f.uow.execute).not.toHaveBeenCalled();
  });
  it('uses the existing fallback reason when qualification supplies none', async () => {
    const f = fixture();
    f.context.getSessionStartContext.mockResolvedValue({ status: 'BLOCKED' });
    await expect(f.start.execute(f.input)).rejects.toMatchObject({
      code: 'SESSION_START_NOT_ALLOWED',
    });
    expect(f.uow.execute).not.toHaveBeenCalled();
  });
  it('replays a reservation completed between the precheck and transaction without duplicate effects', async () => {
    const f = fixture();
    const response = { id: 'original' };
    const { IdempotencyService } =
      await import('@beauty/reliability/idempotency/idempotency.service');
    f.store.find.mockResolvedValueOnce(null).mockResolvedValueOnce({
      status: 'COMPLETED',
      response,
      requestHash: new IdempotencyService().hash({
        tenantId: 'tenant',
        appointmentId: 'appointment',
      }),
    });
    expect(await f.start.execute(f.input)).toBe(response);
    expect(f.sessions.create).not.toHaveBeenCalled();
    expect(f.tx.audit.append).not.toHaveBeenCalled();
    expect(f.tx.outbox.append).not.toHaveBeenCalled();
  });
  it('propagates persistence failure without recording audit/outbox or completing idempotency', async () => {
    const f = fixture();
    const failure = new Error('PERSISTENCE_FAILURE');
    f.sessions.create.mockRejectedValue(failure);
    await expect(f.start.execute(f.input)).rejects.toBe(failure);
    expect(f.tx.audit.append).not.toHaveBeenCalled();
    expect(f.tx.outbox.append).not.toHaveBeenCalled();
    expect(f.tx.idempotency.complete).not.toHaveBeenCalled();
  });
});

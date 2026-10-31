import {
  IdempotencyService,
  IdempotencyInProgressError,
} from './idempotency.service.js';

describe('idempotency reservation lifecycle', () => {
  const input = { resourceId: 'resource', value: 1 };
  const service = new IdempotencyService();
  function store() {
    return {
      find: vi.fn().mockResolvedValue(null),
      reserve: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    };
  }
  it('reserves a new key with its tenant/operation and provided timestamp', async () => {
    const persistence = store();
    const result = await service.reserveOrReplay(
      persistence,
      'tenant',
      'UPDATE',
      'key',
      input,
      'now',
    );
    expect(persistence.find).toHaveBeenCalledWith('tenant', 'UPDATE', 'key');
    expect(result).toMatchObject({
      replay: false,
      record: {
        tenantId: 'tenant',
        operation: 'UPDATE',
        key: 'key',
        requestHash: service.hash(input),
        status: 'PROCESSING',
        createdAt: 'now',
        updatedAt: 'now',
      },
    });
    expect(persistence.reserve).toHaveBeenCalledExactlyOnceWith(result.record);
  });
  it('replays the original completed response without reserving again', async () => {
    const persistence = store();
    const record = {
      status: 'COMPLETED',
      response: { result: 'original' },
      requestHash: service.hash(input),
    };
    persistence.find.mockResolvedValue(record);
    expect(
      await service.reserveOrReplay(
        persistence,
        'tenant',
        'UPDATE',
        'key',
        input,
      ),
    ).toEqual({ record, replay: true });
    expect(persistence.reserve).not.toHaveBeenCalled();
  });
  it.each(['PROCESSING', 'FAILED'])(
    'does not silently retry an existing %s key',
    async (status) => {
      const persistence = store();
      persistence.find.mockResolvedValue({
        status,
        requestHash: service.hash(input),
      });
      await expect(
        service.reserveOrReplay(persistence, 'tenant', 'UPDATE', 'key', input),
      ).rejects.toBeInstanceOf(IdempotencyInProgressError);
      expect(persistence.reserve).not.toHaveBeenCalled();
    },
  );
  it('rejects a blank key before storage access and propagates reservation failures', async () => {
    const persistence = store();
    await expect(
      service.reserveOrReplay(persistence, 'tenant', 'UPDATE', ' ', input),
    ).rejects.toThrow('IDEMPOTENCY_KEY_REQUIRED');
    expect(persistence.find).not.toHaveBeenCalled();
    const failure = new Error('RESERVATION_FAILED');
    persistence.reserve.mockRejectedValue(failure);
    await expect(
      service.reserveOrReplay(persistence, 'tenant', 'UPDATE', 'key', input),
    ).rejects.toBe(failure);
  });
});

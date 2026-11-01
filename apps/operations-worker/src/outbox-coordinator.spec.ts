import { describe, expect, it, vi } from 'vitest';
import { dispatchEligibleOutbox } from './outbox-coordinator.js';
function fixture(events: string[]) {
  const all = vi
    .fn()
    .mockResolvedValue({
      results: events.map((event_type) => ({ event_type })),
    });
  const prepare = vi.fn(() => ({ bind: () => ({ all }) }));
  const dispatchers = {
    operations: vi.fn(async () => 1),
    billing: vi.fn(async () => 2),
    clinical: vi.fn(async () => 3),
  };
  return { prepare, all, dispatchers };
}
describe('scheduled outbox coordinator', () => {
  it('performs one probe and no dispatch when idle', async () => {
    const f = fixture([]);
    expect(
      await dispatchEligibleOutbox(
        { prepare: f.prepare } as never,
        '2030',
        f.dispatchers,
      ),
    ).toEqual([]);
    expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(f.dispatchers.operations).not.toHaveBeenCalled();
    expect(f.dispatchers.billing).not.toHaveBeenCalled();
    expect(f.dispatchers.clinical).not.toHaveBeenCalled();
  });
  it('dispatches each eligible owner once and propagates probe failure', async () => {
    const f = fixture([
      'SessionStarted',
      'SessionCompleted',
      'PaymentReceived',
    ]);
    expect(
      await dispatchEligibleOutbox(
        { prepare: f.prepare } as never,
        '2030',
        f.dispatchers,
      ),
    ).toHaveLength(2);
    expect(f.dispatchers.operations).not.toHaveBeenCalled();
    expect(f.dispatchers.billing).toHaveBeenCalledTimes(1);
    expect(f.dispatchers.clinical).toHaveBeenCalledTimes(1);
    f.all.mockRejectedValueOnce(new Error('unavailable'));
    await expect(
      dispatchEligibleOutbox(
        { prepare: f.prepare } as never,
        '2030',
        f.dispatchers,
      ),
    ).rejects.toThrow('unavailable');
  });
});

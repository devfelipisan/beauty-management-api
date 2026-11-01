import { describe, expect, it, vi } from 'vitest';
import { eligibleOutboxOwners, outboxOwnership } from './ownership.js';
describe('consolidated outbox eligibility', () => {
  it('uses a single query and maps only events owned by the dispatchers', async () => {
    const all = vi
      .fn()
      .mockResolvedValue({
        results: [
          { event_type: 'SessionCompleted' },
          { event_type: 'RefundIssued' },
        ],
      });
    const bind = vi.fn(() => ({ all }));
    const prepare = vi.fn(() => ({ bind }));
    expect(
      await eligibleOutboxOwners({ prepare } as never, '2030-01-01T00:00:00Z'),
    ).toEqual(new Set(['billing', 'clinical']));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0][0]).toContain("status='PROCESSING'");
    expect(bind.mock.calls[0]).toContain('SessionCompleted');
    expect(outboxOwnership.operations).toContain(
      'ProfileImageDeletionRequested',
    );
  });
  it('propagates probe failure rather than reporting an empty queue', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => {
            throw new Error('D1_UNAVAILABLE');
          },
        }),
      }),
    };
    await expect(
      eligibleOutboxOwners(db as never, '2030-01-01'),
    ).rejects.toThrow('D1_UNAVAILABLE');
  });
});

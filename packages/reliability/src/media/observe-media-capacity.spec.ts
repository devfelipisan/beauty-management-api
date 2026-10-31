import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeMediaCapacity } from './observe-media-capacity.js';
describe('aggregate storage observability', () => {
  afterEach(() => vi.restoreAllMocks());
  it('performs no I/O when disabled and only reports aggregate threshold data', async () => {
    const first = vi.fn().mockResolvedValue({ charged_bytes: 7_200_000_000 }),
      prepare = vi.fn(() => ({ first }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await observeMediaCapacity({ prepare } as never, false);
    expect(prepare).not.toHaveBeenCalled();
    await observeMediaCapacity({ prepare } as never, true);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        operation: 'media.capacity',
        chargedBytes: 7_200_000_000,
        limitBytes: 8_000_000_000,
        level: 'critical',
      }),
    );
    first.mockRejectedValueOnce(new Error('sensitive fixture'));
    await expect(
      observeMediaCapacity({ prepare } as never, true),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenLastCalledWith(
      '{"operation":"media.capacity","status":"unavailable"}',
    );
  });
});

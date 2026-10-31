import { describe, expect, it, vi } from 'vitest';
import { limitedD1 } from './limited-d1.js';

describe('invocation D1 budget', () => {
  it('queues the sixth I/O, releases after failure, and preserves native batch statements', async () => {
    const releases: Array<() => void> = [];
    let peak = 0;
    let active = 0;
    const statement = {
      bind: vi.fn(() => statement),
      first: vi.fn(async () => {
        active++;
        peak = Math.max(active, peak);
        await new Promise<void>((r) => releases.push(r));
        active--;
        throw new Error('failure');
      }),
      all: vi.fn(async () => ({ results: [] })),
      run: vi.fn(async () => ({ success: true })),
    };
    const batch = vi.fn(async () => []);
    const db = limitedD1({ prepare: () => statement, batch });
    const results = Array.from({ length: 6 }, () =>
      db
        .prepare('SELECT 1')
        .first()
        .catch(() => null),
    );
    expect(statement.first).toHaveBeenCalledTimes(5);
    releases.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(statement.first).toHaveBeenCalledTimes(6);
    releases.splice(0).forEach((r) => r());
    await Promise.all(results);
    expect(peak).toBe(5);
    await db.batch([db.prepare('UPDATE x').bind(1)]);
    expect(batch).toHaveBeenCalledWith([statement]);
    await expect(db.batch([statement])).rejects.toThrow(
      'D1_STATEMENT_CONTEXT_MISMATCH',
    );
  });
});

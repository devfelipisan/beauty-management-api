import { describe, expect, it, vi } from 'vitest';
const doubles = vi.hoisted(() => ({
  release: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  pool: vi.fn(),
}));
vi.mock('pg', () => ({
  default: {
    Pool: class {
      constructor(options: unknown) {
        doubles.pool(options);
      }
      async connect() {
        return { query: doubles.query, release: doubles.release };
      }
      end = doubles.end;
    },
  },
}));
import { DatabaseService } from './database.service.js';

describe('legacy PostgreSQL lifecycle', () => {
  it('caps the pool at five and releases clients after success or failure', async () => {
    const service = new DatabaseService({
      databaseUrl: 'postgresql://fixture.invalid/db',
    } as never);
    expect(doubles.pool).toHaveBeenCalledExactlyOnceWith({
      connectionString: 'postgresql://fixture.invalid/db',
      max: 5,
    });
    expect(await service.isReachable()).toBe(true);
    doubles.query.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.isReachable()).rejects.toThrow('unavailable');
    expect(doubles.release).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();
    expect(doubles.end).toHaveBeenCalledTimes(1);
  });
});

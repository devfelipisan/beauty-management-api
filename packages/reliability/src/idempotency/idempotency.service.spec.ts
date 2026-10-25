import { IdempotencyKeyConflictError, IdempotencyService } from './idempotency.service.js';
describe('IdempotencyService', () => {
  it('hashes equal input deterministically', () => { const service = new IdempotencyService(); expect(service.hash({ a: 1 })).toBe(service.hash({ a: 1 })); });
  it('rejects same key with a different request hash', async () => { const service = new IdempotencyService(); const store = { find: async () => ({ id: '1', tenantId: 't1', operation: 'op', key: 'k', requestHash: 'different', status: 'COMPLETED' as const, createdAt: '', updatedAt: '' }), reserve: async () => undefined, complete: async () => undefined, fail: async () => undefined }; await expect(service.reserveOrReplay(store, 't1', 'op', 'k', { a: 1 })).rejects.toBeInstanceOf(IdempotencyKeyConflictError); });
});

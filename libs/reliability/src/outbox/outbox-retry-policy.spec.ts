import { OutboxRetryPolicy } from './outbox-retry-policy.js';

describe('OutboxRetryPolicy', () => {
  it('uses bounded deterministic backoff and dead-letters at the limit', () => {
    const policy = new OutboxRetryPolicy(3, 10);
    expect(policy.decide(1, 'TIMEOUT', '2028-01-01T00:00:00.000Z')).toEqual({ kind: 'RETRY', availableAt: '2028-01-01T00:00:10.000Z' });
    expect(policy.decide(2, 'TIMEOUT', '2028-01-01T00:00:00.000Z')).toEqual({ kind: 'RETRY', availableAt: '2028-01-01T00:00:20.000Z' });
    expect(policy.decide(3, 'TIMEOUT', '2028-01-01T00:00:00.000Z')).toEqual({ kind: 'DEAD', errorCode: 'OUTBOX_MAX_ATTEMPTS' });
  });
});

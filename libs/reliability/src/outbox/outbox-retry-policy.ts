export type RetryDecision = { kind: 'RETRY'; availableAt: string } | { kind: 'DEAD'; errorCode: string };

export class OutboxRetryPolicy {
  constructor(private readonly maxAttempts = 5, private readonly baseRetrySeconds = 30) {}

  decide(attemptCount: number, errorCode: string, now: string): RetryDecision {
    if (attemptCount >= this.maxAttempts) return { kind: 'DEAD', errorCode: 'OUTBOX_MAX_ATTEMPTS' };
    const delay = Math.min(this.baseRetrySeconds * (2 ** Math.max(0, attemptCount - 1)), 3600);
    return { kind: 'RETRY', availableAt: new Date(Date.parse(now) + delay * 1000).toISOString() };
  }
}

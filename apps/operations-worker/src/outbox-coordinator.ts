import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import {
  eligibleOutboxOwners,
  type outboxOwnership,
} from '@beauty/reliability/outbox/ownership';
type Owner = keyof typeof outboxOwnership;
export async function dispatchEligibleOutbox(
  db: D1DatabaseLike,
  now: string,
  dispatchers: Record<Owner, () => Promise<unknown>>,
) {
  const owners = await eligibleOutboxOwners(db, now);
  return Promise.allSettled(
    (['operations', 'billing', 'clinical'] as const)
      .filter((owner) => owners.has(owner))
      .map((owner) => dispatchers[owner]()),
  );
}

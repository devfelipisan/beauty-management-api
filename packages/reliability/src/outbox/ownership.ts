import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
export const outboxOwnership = {
  operations: [
    'ProfileImageDeletionRequested',
    'ProfileImageReconciliationRequested',
    'FinancialSettlementRequested',
    'AppointmentCanceled',
    'AppointmentNoShowRecorded',
  ],
  billing: [
    'DepositConfirmed',
    'DepositExpired',
    'PackageUnitConsumed',
    'PaymentReceived',
    'RefundIssued',
  ],
  clinical: [
    'SessionStarted',
    'SessionCompleted',
    'ReturnRecommended',
    'PackageConsumptionRequested',
    'ClinicalRestrictionActivated',
    'ClinicalRestrictionResolved',
  ],
} as const;
export async function eligibleOutboxOwners(
  db: D1DatabaseLike,
  now: string,
): Promise<Set<keyof typeof outboxOwnership>> {
  const entries = Object.entries(outboxOwnership) as Array<
    [keyof typeof outboxOwnership, readonly string[]]
  >;
  const types = entries.flatMap(([, values]) => values),
    placeholders = types.map(() => '?').join(',');
  const result = await db
    .prepare(
      `SELECT DISTINCT event_type FROM outbox_events WHERE status='PENDING' AND available_at<=? AND event_type IN (${placeholders}) UNION SELECT DISTINCT event_type FROM outbox_events WHERE status='PROCESSING' AND claim_expires_at<=? AND event_type IN (${placeholders})`,
    )
    .bind(now, ...types, now, ...types)
    .all<{ event_type: string }>();
  const found = new Set(result.results.map((row) => row.event_type));
  return new Set(
    entries
      .filter(([, values]) => values.some((type) => found.has(type)))
      .map(([owner]) => owner),
  );
}

import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';

/** Aggregate only after writes; telemetry failure cannot invalidate a committed upload. */
export async function observeMediaCapacity(
  database: D1DatabaseLike,
  enabled: boolean,
): Promise<void> {
  if (!enabled) return;
  try {
    const row = await database
      .prepare(
        "SELECT charged_bytes FROM media_capacity WHERE bucket='beauty-r2'",
      )
      .first<{ charged_bytes: number }>();
    if (!row) return;
    const chargedBytes = row.charged_bytes;
    console.log(
      JSON.stringify({
        operation: 'media.capacity',
        chargedBytes,
        limitBytes: 8_000_000_000,
        level:
          chargedBytes >= 8_000_000_000
            ? 'blocked'
            : chargedBytes >= 7_200_000_000
              ? 'critical'
              : chargedBytes >= 6_000_000_000
                ? 'warning'
                : 'normal',
      }),
    );
  } catch {
    console.log(
      JSON.stringify({ operation: 'media.capacity', status: 'unavailable' }),
    );
  }
}

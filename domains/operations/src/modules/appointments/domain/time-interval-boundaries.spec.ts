import { TimeInterval } from './time-interval.js';

describe('time interval boundaries', () => {
  it('rejects equal/reversed intervals and nonpositive or noninteger durations', () => {
    for (const end of ['2026-10-31T10:00:00Z', '2026-10-31T09:00:00Z'])
      expect(() => TimeInterval.create('2026-10-31T10:00:00Z', end)).toThrow(
        'startsAt must be before endsAt',
      );
    for (const duration of [0, -1, 0.5])
      expect(() =>
        TimeInterval.fromDuration('2026-10-31T10:00:00Z', duration),
      ).toThrow('Duration must be positive');
  });
});

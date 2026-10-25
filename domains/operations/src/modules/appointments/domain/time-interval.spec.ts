import { TimeInterval } from './time-interval.js';
describe('TimeInterval', () => {
  it('derives the end from the service duration', () => { const interval = TimeInterval.fromDuration('2026-01-01T09:00:00.000Z', 30); expect(interval.endsAt).toBe('2026-01-01T09:30:00.000Z'); });
  it('allows touching intervals and rejects overlap', () => { const first = TimeInterval.create('2026-01-01T09:00:00.000Z', '2026-01-01T09:30:00.000Z'); const second = TimeInterval.create('2026-01-01T09:30:00.000Z', '2026-01-01T10:00:00.000Z'); const overlap = TimeInterval.create('2026-01-01T09:15:00.000Z', '2026-01-01T09:45:00.000Z'); expect(first.overlaps(second)).toBe(false); expect(first.overlaps(overlap)).toBe(true); });
});

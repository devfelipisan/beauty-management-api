import { AvailabilityPolicy } from './availability-policy.js';
import { TimeInterval } from '../time-interval.js';

const interval = (start: number, end: number) =>
  TimeInterval.create(
    new Date(Date.UTC(2026, 9, 31, start)).toISOString(),
    new Date(Date.UTC(2026, 9, 31, end)).toISOString(),
  );
describe('availability interval policy', () => {
  const policy = new AvailabilityPolicy();
  it('rejects a partial overlap with an existing appointment', () => {
    const candidate = TimeInterval.create(
      '2026-01-01T09:15:00.000Z',
      '2026-01-01T09:45:00.000Z',
    );
    const existing = TimeInterval.create(
      '2026-01-01T09:00:00.000Z',
      '2026-01-01T09:30:00.000Z',
    );
    expect(
      policy.isAvailable({
        interval: candidate,
        existing: [existing],
        blocked: [],
      }),
    ).toBe(false);
  });
  it.each([
    { existing: [], blocked: [], expected: true },
    { existing: [interval(10, 12)], blocked: [], expected: false },
    { existing: [], blocked: [interval(9, 11)], expected: false },
    {
      existing: [interval(8, 10), interval(11, 12)],
      blocked: [],
      expected: true,
    },
    { existing: [], blocked: [], workingPeriods: [], expected: false },
    {
      existing: [],
      blocked: [],
      workingPeriods: [interval(10, 11)],
      expected: true,
    },
    {
      existing: [],
      blocked: [],
      workingPeriods: [interval(9, 12)],
      expected: true,
    },
    {
      existing: [],
      blocked: [],
      workingPeriods: [interval(9, 10), interval(11, 12)],
      expected: false,
    },
  ])(
    'evaluates overlap/working boundaries %# without side effects',
    ({ expected, ...context }) => {
      expect(
        policy.isAvailable({ interval: interval(10, 11), ...context }),
      ).toBe(expected);
    },
  );
});

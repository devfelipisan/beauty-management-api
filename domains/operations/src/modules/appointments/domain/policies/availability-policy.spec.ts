import { AvailabilityPolicy } from './availability-policy.js';
import { TimeInterval } from '../time-interval.js';
describe('AvailabilityPolicy', () => { it('rejects an interval overlapping an existing appointment', () => { const candidate=TimeInterval.create('2026-01-01T09:15:00.000Z','2026-01-01T09:45:00.000Z'); const existing=TimeInterval.create('2026-01-01T09:00:00.000Z','2026-01-01T09:30:00.000Z'); expect(new AvailabilityPolicy().isAvailable({ interval:candidate, existing:[existing], blocked:[] })).toBe(false); }); });

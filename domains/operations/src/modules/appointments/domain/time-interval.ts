import { DomainError } from '@beauty/kernel';
export class TimeInterval {
  readonly durationMinutes: number;
  private constructor(readonly startsAt: string, readonly endsAt: string) { const start = Date.parse(startsAt); const end = Date.parse(endsAt); if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new DomainError('APPOINTMENT_INVALID_INTERVAL', 'startsAt must be before endsAt'); this.durationMinutes = (end - start) / 60000; }
  static fromDuration(startsAt: string, durationMinutes: number) { if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) throw new DomainError('APPOINTMENT_INVALID_INTERVAL', 'Duration must be positive'); const end = new Date(Date.parse(startsAt) + durationMinutes * 60000).toISOString(); return new TimeInterval(new Date(startsAt).toISOString(), end); }
  static create(startsAt: string, endsAt: string) { return new TimeInterval(new Date(startsAt).toISOString(), new Date(endsAt).toISOString()); }
  overlaps(other: TimeInterval) { return Date.parse(this.startsAt) < Date.parse(other.endsAt) && Date.parse(this.endsAt) > Date.parse(other.startsAt); }
}

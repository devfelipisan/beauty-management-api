import { AppointmentStatus } from '../appointment.js';
import { AppointmentOccupancyPolicy } from './appointment-occupancy-policy.js';

describe('appointment occupancy (ADR-0015)', () => {
  const policy = new AppointmentOccupancyPolicy();

  it.each([
    AppointmentStatus.AWAITING_DEPOSIT,
    AppointmentStatus.AWAITING_CONFIRMATION,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.RESCHEDULED,
    AppointmentStatus.NO_SHOW,
  ])('preserves the persisted interval for %s', (status) => {
    expect(policy.occupies(status)).toBe(true);
  });

  it.each([AppointmentStatus.CANCELED, AppointmentStatus.EXPIRED])(
    'releases the interval for %s',
    (status) => {
      expect(policy.occupies(status)).toBe(false);
    },
  );
});

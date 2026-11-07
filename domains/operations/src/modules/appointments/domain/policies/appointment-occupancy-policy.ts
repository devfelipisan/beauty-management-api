import { AppointmentStatus } from '../appointment.js';
export class AppointmentOccupancyPolicy {
  occupies(status: AppointmentStatus): boolean {
    // ADR-0015: a rescheduled appointment occupies its persisted new interval.
    return ![AppointmentStatus.CANCELED, AppointmentStatus.EXPIRED].includes(
      status,
    );
  }
}

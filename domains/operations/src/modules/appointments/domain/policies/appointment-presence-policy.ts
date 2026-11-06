import { AppointmentStatus } from '../appointment.js';

export class AppointmentPresencePolicy {
  canConfirm(status: AppointmentStatus): boolean {
    return status === AppointmentStatus.AWAITING_CONFIRMATION;
  }

  canCheckIn(status: AppointmentStatus): boolean {
    return status === AppointmentStatus.CONFIRMED;
  }
}

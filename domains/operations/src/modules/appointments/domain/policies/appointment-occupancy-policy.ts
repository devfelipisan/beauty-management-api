import { AppointmentStatus } from '../appointment.js';
export class AppointmentOccupancyPolicy { occupies(status: AppointmentStatus) { return ![AppointmentStatus.CANCELED, AppointmentStatus.RESCHEDULED, AppointmentStatus.EXPIRED].includes(status); } }

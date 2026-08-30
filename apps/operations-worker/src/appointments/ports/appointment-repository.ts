import type { Appointment } from '../domain/appointment.js';
import type { TimeInterval } from '../domain/time-interval.js';
import type { TransactionalWriteContext } from '../../../../../libs/reliability/src/index.js';
export interface AppointmentRepository { findById(tenantId: string, appointmentId: string): Promise<Appointment | null>; findConflicts(tenantId: string, professionalId: string, interval: TimeInterval): Promise<Appointment[]>; reserve(appointment: Appointment, transaction: TransactionalWriteContext): Promise<void>; }
export const APPOINTMENT_REPOSITORY = Symbol('APPOINTMENT_REPOSITORY');

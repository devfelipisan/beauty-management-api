import type { Appointment, AppointmentProps } from '../domain/appointment.js';
import type { TimeInterval } from '../domain/time-interval.js';
import type { TransactionalWriteContext } from '../../../../../libs/reliability/src/unit-of-work/transactional-write-context.js';
export interface AppointmentRepository { findById(tenantId: string, appointmentId: string): Promise<Appointment | null>; findConflicts(tenantId: string, professionalId: string, interval: TimeInterval): Promise<Appointment[]>; reserve(appointment: Appointment, transaction: TransactionalWriteContext): Promise<void>; transitionStatus(tenantId:string,appointmentId:string,from:AppointmentProps['status'],to:AppointmentProps['status'],at:string,transaction:TransactionalWriteContext,actorId?:string):Promise<void>; }
export const APPOINTMENT_REPOSITORY = Symbol('APPOINTMENT_REPOSITORY');

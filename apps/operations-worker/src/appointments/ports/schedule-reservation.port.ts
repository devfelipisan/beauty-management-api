import type { Appointment } from '../domain/appointment.js';
import type { TransactionalWriteContext } from '../../../../../libs/reliability/src/index.js';
export interface ScheduleReservationPort { reserve(appointment: Appointment, transaction: TransactionalWriteContext): Promise<void>; }

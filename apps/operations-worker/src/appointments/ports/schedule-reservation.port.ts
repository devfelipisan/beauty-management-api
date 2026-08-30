import type { Appointment } from '../domain/appointment.js';
import type { TransactionalWriteContext } from '../../../../../libs/reliability/src/unit-of-work/transactional-write-context.js';
export interface ScheduleReservationPort { reserve(appointment: Appointment, transaction: TransactionalWriteContext): Promise<void>; }

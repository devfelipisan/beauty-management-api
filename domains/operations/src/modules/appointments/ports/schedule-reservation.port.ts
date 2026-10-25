import type { Appointment } from '../domain/appointment.js';
import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
export interface ScheduleReservationPort { reserve(appointment: Appointment, transaction: TransactionalWriteContext): Promise<void>; }

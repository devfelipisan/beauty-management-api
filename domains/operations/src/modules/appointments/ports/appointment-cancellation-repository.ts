import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
import type { AppointmentStatus } from '../domain/appointment.js';
import type { AppointmentChangeFinancialDecision } from '@beauty/contracts';

export interface AppointmentCancellationRepository {
  change(
    i: {
      tenantId: string;
      appointmentId: string;
      from: AppointmentStatus;
      to: 'CANCELED' | 'NO_SHOW';
      reason: string;
      note?: string;
      origin?: string;
      actorId: string;
      at: string;
      requestId: string;
      decision: AppointmentChangeFinancialDecision;
    },
    tx: TransactionalWriteContext,
  ): void;
}

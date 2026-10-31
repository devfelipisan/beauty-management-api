import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';

export interface AppointmentChangeRepository {
  reschedule(
    i: {
      tenantId: string;
      appointmentId: string;
      startsAt: string;
      endsAt: string;
      professionalId: string;
      previousStartsAt: string;
      previousEndsAt: string;
      previousProfessionalId: string;
      previousStatus: string;
      previousUpdatedAt: string;
      serviceId: string;
      reason: string;
      changedAt: string;
      changedBy: string;
      requestId: string;
    },
    tx: TransactionalWriteContext,
  ): void;
}

import type { AppointmentChangeRepository } from '../ports/appointment-change-repository.js';
import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';

export class D1AppointmentChangeRepository implements AppointmentChangeRepository {
  constructor(private readonly db: D1Database) {}

  reschedule(
    i: Parameters<AppointmentChangeRepository['reschedule']>[0],
    tx: TransactionalWriteContext,
  ) {
    tx.add({
      kind: 'D1_SQL',
      failureCode: 'APPOINTMENT_RESCHEDULE_CONFLICT',
      expectedChanges: 1,
      sql: `UPDATE appointments SET starts_at=?, ends_at=?, professional_id=?, status='RESCHEDULED', updated_at=?
        WHERE tenant_id=? AND id=? AND status=? AND updated_at=? AND starts_at=? AND ends_at=? AND professional_id=? AND service_id=?
        AND status NOT IN ('COMPLETED','CANCELED','NO_SHOW','IN_PROGRESS')
        AND EXISTS (SELECT 1 FROM professionals p JOIN professional_services ps ON ps.tenant_id=p.tenant_id AND ps.professional_id=p.id
          WHERE p.tenant_id=? AND p.id=? AND p.status='ACTIVE' AND ps.service_id=?)
        AND NOT EXISTS (SELECT 1 FROM appointments occupied WHERE occupied.tenant_id=? AND occupied.professional_id=?
          AND occupied.id<>? AND occupied.starts_at<? AND occupied.ends_at>? AND occupied.status NOT IN ('CANCELED','EXPIRED'))`,
      params: [
        i.startsAt,
        i.endsAt,
        i.professionalId,
        i.changedAt,
        i.tenantId,
        i.appointmentId,
        i.previousStatus,
        i.previousUpdatedAt,
        i.previousStartsAt,
        i.previousEndsAt,
        i.previousProfessionalId,
        i.serviceId,
        i.tenantId,
        i.professionalId,
        i.serviceId,
        i.tenantId,
        i.professionalId,
        i.appointmentId,
        i.endsAt,
        i.startsAt,
      ],
    });
    tx.add({
      kind: 'D1_SQL',
      failureCode: 'RESCHEDULE_HISTORY_FAILED',
      sql: 'INSERT INTO appointment_reschedule_history (id,tenant_id,appointment_id,previous_starts_at,previous_ends_at,previous_professional_id,new_starts_at,new_ends_at,new_professional_id,reason,changed_at,changed_by,source_request_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      params: [
        crypto.randomUUID(),
        i.tenantId,
        i.appointmentId,
        i.previousStartsAt,
        i.previousEndsAt,
        i.previousProfessionalId,
        i.startsAt,
        i.endsAt,
        i.professionalId,
        i.reason,
        i.changedAt,
        i.changedBy,
        i.requestId,
      ],
    });
  }
}

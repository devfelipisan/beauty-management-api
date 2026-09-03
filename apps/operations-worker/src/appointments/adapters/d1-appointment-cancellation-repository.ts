import type {TransactionalWriteContext} from '../../../../../libs/reliability/src/unit-of-work/transactional-write-context.js';
import type {AppointmentStatus} from '../domain/appointment.js';
import type {AppointmentChangeFinancialDecision} from '../../../../../libs/contracts/src/index.js';
export class D1AppointmentCancellationRepository {
  constructor(private readonly db:D1Database){}
  change(i:{tenantId:string;appointmentId:string;from:AppointmentStatus;to:'CANCELED'|'NO_SHOW';reason:string;note?:string;origin?:string;actorId:string;at:string;requestId:string;decision:AppointmentChangeFinancialDecision},tx:TransactionalWriteContext){
    tx.add({kind:'D1_SQL',failureCode:'APPOINTMENT_CHANGE_CONFLICT',expectedChanges:1,sql:"UPDATE appointments SET status=?,cancellation_origin=?,cancellation_reason=?,cancellation_note=?,canceled_at=?,canceled_by=?,updated_at=? WHERE tenant_id=? AND id=? AND status=?",params:[i.to,i.origin??'SYSTEM_EXPIRATION',i.reason,i.note??null,i.at,i.actorId,i.at,i.tenantId,i.appointmentId,i.from]});
    if(i.to==='CANCELED')tx.add({kind:'D1_SQL',failureCode:'CANCELLATION_HISTORY_FAILED',sql:'INSERT INTO appointment_cancellation_history (id,tenant_id,appointment_id,reason,note,origin,changed_at,changed_by,source_request_id,financial_decision_json) VALUES (?,?,?,?,?,?,?,?,?,?)',params:[crypto.randomUUID(),i.tenantId,i.appointmentId,i.reason,i.note??null,i.origin??'SYSTEM_EXPIRATION',i.at,i.actorId,i.requestId,JSON.stringify(i.decision)]});
  }
}

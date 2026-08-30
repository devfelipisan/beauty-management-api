import type { D1DatabaseLike } from '../../../../../libs/database/src/d1/d1.types.js';
import type { TransactionalWriteContext } from '../../../../../libs/reliability/src/unit-of-work/transactional-write-context.js';
import { Session, type SessionProps } from '../domain/session.js';
import type { SessionRepository } from '../ports/session-repository.js';
type Row={id:string;tenant_id:string;appointment_id:string;customer_id:string;service_id:string;professional_id:string;status:SessionProps['status'];started_at:string;started_by:string;completed_at?:string;completed_by?:string;created_at:string;updated_at:string};
export class D1SessionRepository implements SessionRepository {
  constructor(private readonly db:D1DatabaseLike){}
  private map(row:Row){return Session.start(row.id,{tenantId:row.tenant_id,appointmentId:row.appointment_id,customerId:row.customer_id,serviceId:row.service_id,professionalId:row.professional_id,startedAt:row.started_at,startedBy:row.started_by,completedAt:row.completed_at,completedBy:row.completed_by,createdAt:row.created_at,updatedAt:row.updated_at});}
  async findById(tenantId:string,id:string){const row=await this.db.prepare('SELECT * FROM sessions WHERE tenant_id = ? AND id = ?').bind(tenantId,id).first<Row>();return row?this.map(row):null;}
  async findByAppointment(tenantId:string,appointmentId:string){const row=await this.db.prepare('SELECT * FROM sessions WHERE tenant_id = ? AND appointment_id = ?').bind(tenantId,appointmentId).first<Row>();return row?this.map(row):null;}
  async create(session:Session,transaction:TransactionalWriteContext){const x=session.data;transaction.add({kind:'D1_SQL',failureCode:'SESSION_ALREADY_STARTED',expectedChanges:1,sql:'INSERT INTO sessions (id,tenant_id,appointment_id,customer_id,service_id,professional_id,status,started_at,started_by,completed_at,completed_by,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',params:[session.id,x.tenantId,x.appointmentId,x.customerId,x.serviceId,x.professionalId,x.status,x.startedAt,x.startedBy,x.completedAt??null,x.completedBy??null,x.createdAt,x.updatedAt]});}
}

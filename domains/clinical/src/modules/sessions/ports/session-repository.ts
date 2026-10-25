import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
import type { Session } from '../domain/session.js';
export interface SessionRepository { findById(tenantId:string,id:string):Promise<Session|null>; findByAppointment(tenantId:string,appointmentId:string):Promise<Session|null>; create(session:Session,transaction:TransactionalWriteContext):Promise<void>; complete?(tenantId:string,id:string,at:string,by:string,transaction:TransactionalWriteContext):void; }
